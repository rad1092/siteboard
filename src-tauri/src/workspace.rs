use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use thiserror::Error;

const MAX_PROJECT_BYTES: u64 = 20 * 1024 * 1024;
const MAX_ARCHIVE_BYTES: usize = 64 * 1024 * 1024;
const MAX_RECENT_PROJECTS: usize = 8;
const AUTOSAVE_FILE: &str = "autosave.siteboard";
const SESSION_FILE: &str = "session.json";

#[derive(Debug, Error)]
pub enum WorkspaceError {
    #[error("프로젝트 파일 경로가 올바르지 않습니다.")]
    InvalidProjectPath,
    #[error("프로젝트 파일은 20MB 이하여야 합니다.")]
    ProjectTooLarge,
    #[error("프로젝트 파일의 JSON을 읽을 수 없습니다.")]
    InvalidProject,
    #[error("이 Siteboard보다 새로운 형식의 프로젝트입니다.")]
    FutureProject,
    #[error("배포 ZIP은 64MB 이하여야 합니다.")]
    ArchiveTooLarge,
    #[error("선택한 파일은 ZIP 경로가 아닙니다.")]
    InvalidArchivePath,
    #[error("복구 원본은 20MB 이하여야 합니다.")]
    RecoveryTooLarge,
    #[error("기존 프로젝트가 손상되어 복구 사본으로 보존했습니다. 확인 없이 덮어쓰지 않았습니다.")]
    UnsafeReplacement,
    #[error("프로젝트 파일을 읽거나 저장하지 못했습니다: {0}")]
    Io(#[from] std::io::Error),
    #[error("데스크톱 세션을 읽거나 저장하지 못했습니다: {0}")]
    Session(#[from] serde_json::Error),
    #[error("프로젝트 상태 잠금을 얻지 못했습니다.")]
    Lock,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRuntimeStatus {
    pub kind: &'static str,
    pub app_data_directory: String,
    pub active_project_path: Option<String>,
    pub active_project_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopProjectFile {
    pub content: String,
    pub path: String,
    pub file_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkspaceLoad {
    pub content: String,
    pub path: String,
    pub file_name: String,
    pub source: &'static str,
    pub recovery_raw: Option<String>,
    pub recovery_kind: Option<&'static str>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSession {
    schema_version: u8,
    active_project: Option<PathBuf>,
    recent_projects: Vec<PathBuf>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProjectValidity {
    Current,
    Future,
    Invalid,
}

pub struct WorkspaceManager {
    app_data: PathBuf,
    session: Mutex<DesktopSession>,
    io: Mutex<()>,
}

impl WorkspaceManager {
    pub fn new(app_data: PathBuf) -> Result<Self, WorkspaceError> {
        fs::create_dir_all(&app_data)?;
        let session = load_session(&app_data).unwrap_or_default();
        Ok(Self {
            app_data,
            session: Mutex::new(session),
            io: Mutex::new(()),
        })
    }

    pub fn status(&self) -> DesktopRuntimeStatus {
        let active = self
            .session
            .lock()
            .ok()
            .and_then(|session| session.active_project.clone());
        DesktopRuntimeStatus {
            kind: "desktop",
            app_data_directory: self.app_data.to_string_lossy().into_owned(),
            active_project_path: active
                .as_ref()
                .map(|path| path.to_string_lossy().into_owned()),
            active_project_name: active
                .as_ref()
                .and_then(|path| path.file_name())
                .map(|name| name.to_string_lossy().into_owned()),
        }
    }

    pub fn load_workspace(&self) -> Result<Option<DesktopWorkspaceLoad>, WorkspaceError> {
        let _io = self.io.lock().map_err(|_| WorkspaceError::Lock)?;
        let active = self
            .session
            .lock()
            .map_err(|_| WorkspaceError::Lock)?
            .active_project
            .clone();
        let target = active.unwrap_or_else(|| self.app_data.join(AUTOSAVE_FILE));
        if !target.exists() {
            let backup = backup_path(&target);
            if backup.is_file() {
                let backup_raw = read_limited(&backup)?;
                return match project_validity(&backup_raw) {
                    ProjectValidity::Current => Ok(Some(workspace_load(
                        &target, backup_raw, "backup", None, None,
                    ))),
                    ProjectValidity::Future => Err(WorkspaceError::FutureProject),
                    ProjectValidity::Invalid => Err(WorkspaceError::InvalidProject),
                };
            }
            return Ok(None);
        }

        let raw = read_limited(&target)?;
        match project_validity(&raw) {
            ProjectValidity::Current => {
                Ok(Some(workspace_load(&target, raw, "primary", None, None)))
            }
            validity => {
                let recovery_path = self.preserve_recovery(&target, &raw)?;
                let backup = backup_path(&target);
                if backup.is_file() {
                    let backup_raw = read_limited(&backup)?;
                    if project_validity(&backup_raw) == ProjectValidity::Current {
                        return Ok(Some(workspace_load(
                            &target,
                            backup_raw,
                            "backup",
                            Some(raw),
                            Some(match validity {
                                ProjectValidity::Future => "future-schema",
                                _ => "corrupt",
                            }),
                        )));
                    }
                }
                Err(match validity {
                    ProjectValidity::Future => WorkspaceError::FutureProject,
                    _ => {
                        let _ = recovery_path;
                        WorkspaceError::InvalidProject
                    }
                })
            }
        }
    }

    pub fn read_project(
        &self,
        path: impl AsRef<Path>,
    ) -> Result<DesktopProjectFile, WorkspaceError> {
        let _io = self.io.lock().map_err(|_| WorkspaceError::Lock)?;
        let path = valid_project_path(path.as_ref())?;
        let raw = read_limited(&path)?;
        match project_validity(&raw) {
            ProjectValidity::Current => Ok(DesktopProjectFile {
                file_name: file_name(&path),
                path: path.to_string_lossy().into_owned(),
                content: raw,
            }),
            ProjectValidity::Future => Err(WorkspaceError::FutureProject),
            ProjectValidity::Invalid => Err(WorkspaceError::InvalidProject),
        }
    }

    pub fn use_project(
        &self,
        path: impl AsRef<Path>,
    ) -> Result<DesktopRuntimeStatus, WorkspaceError> {
        let _io = self.io.lock().map_err(|_| WorkspaceError::Lock)?;
        let path = valid_project_path(path.as_ref())?;
        if !path.is_file() {
            return Err(WorkspaceError::InvalidProjectPath);
        }
        let raw = read_limited(&path)?;
        if project_validity(&raw) != ProjectValidity::Current {
            return Err(WorkspaceError::InvalidProject);
        }
        self.set_active(Some(path))?;
        Ok(self.status())
    }

    pub fn new_project(&self) -> Result<DesktopRuntimeStatus, WorkspaceError> {
        let _io = self.io.lock().map_err(|_| WorkspaceError::Lock)?;
        self.set_active(None)?;
        Ok(self.status())
    }

    pub fn save_active(
        &self,
        content: &str,
        allow_unsafe_replacement: bool,
    ) -> Result<DesktopRuntimeStatus, WorkspaceError> {
        let _io = self.io.lock().map_err(|_| WorkspaceError::Lock)?;
        validate_project_content(content)?;
        let target = self
            .session
            .lock()
            .map_err(|_| WorkspaceError::Lock)?
            .active_project
            .clone()
            .unwrap_or_else(|| self.app_data.join(AUTOSAVE_FILE));
        self.write_project(&target, content, allow_unsafe_replacement)?;
        Ok(self.status())
    }

    pub fn save_to(
        &self,
        path: impl AsRef<Path>,
        content: &str,
    ) -> Result<DesktopRuntimeStatus, WorkspaceError> {
        let _io = self.io.lock().map_err(|_| WorkspaceError::Lock)?;
        validate_project_content(content)?;
        let path = normalize_save_project_path(path.as_ref())?;
        self.write_project(&path, content, false)?;
        self.set_active(Some(path))?;
        Ok(self.status())
    }

    pub fn write_archive(
        &self,
        path: impl AsRef<Path>,
        bytes: &[u8],
    ) -> Result<PathBuf, WorkspaceError> {
        let _io = self.io.lock().map_err(|_| WorkspaceError::Lock)?;
        if bytes.len() > MAX_ARCHIVE_BYTES {
            return Err(WorkspaceError::ArchiveTooLarge);
        }
        let path = normalize_archive_path(path.as_ref())?;
        atomic_write(&path, bytes, false)?;
        Ok(path)
    }

    pub fn write_recovery_export(
        &self,
        path: impl AsRef<Path>,
        content: &str,
    ) -> Result<PathBuf, WorkspaceError> {
        let _io = self.io.lock().map_err(|_| WorkspaceError::Lock)?;
        if content.len() as u64 > MAX_PROJECT_BYTES {
            return Err(WorkspaceError::RecoveryTooLarge);
        }
        let path = normalize_recovery_path(path.as_ref())?;
        atomic_write(&path, content.as_bytes(), false)?;
        Ok(path)
    }

    fn write_project(
        &self,
        path: &Path,
        content: &str,
        allow_unsafe_replacement: bool,
    ) -> Result<(), WorkspaceError> {
        if path.exists() {
            let existing = read_limited(path)?;
            if project_validity(&existing) != ProjectValidity::Current {
                self.preserve_recovery(path, &existing)?;
                if !allow_unsafe_replacement {
                    return Err(WorkspaceError::UnsafeReplacement);
                }
            }
        }
        atomic_write(path, content.as_bytes(), true)?;
        Ok(())
    }

    fn preserve_recovery(&self, source: &Path, raw: &str) -> Result<PathBuf, WorkspaceError> {
        let recovery_directory = self.app_data.join("recovery");
        fs::create_dir_all(&recovery_directory)?;
        let stem = source
            .file_stem()
            .map(|value| value.to_string_lossy())
            .unwrap_or_else(|| "project".into());
        let mut index = 1u32;
        loop {
            let candidate = recovery_directory.join(format!("{stem}-recovery-{index}.txt"));
            if !candidate.exists() {
                atomic_write(&candidate, raw.as_bytes(), false)?;
                return Ok(candidate);
            }
            index = index.saturating_add(1);
        }
    }

    fn set_active(&self, active: Option<PathBuf>) -> Result<(), WorkspaceError> {
        let mut session = self.session.lock().map_err(|_| WorkspaceError::Lock)?;
        session.schema_version = 1;
        session.active_project = active.clone();
        if let Some(path) = active {
            session.recent_projects.retain(|item| item != &path);
            session.recent_projects.insert(0, path);
            session.recent_projects.truncate(MAX_RECENT_PROJECTS);
        }
        save_session(&self.app_data, &session)?;
        Ok(())
    }
}

fn workspace_load(
    path: &Path,
    content: String,
    source: &'static str,
    recovery_raw: Option<String>,
    recovery_kind: Option<&'static str>,
) -> DesktopWorkspaceLoad {
    DesktopWorkspaceLoad {
        file_name: file_name(path),
        path: path.to_string_lossy().into_owned(),
        content,
        source,
        recovery_raw,
        recovery_kind,
    }
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| "project.siteboard".into())
}

fn read_limited(path: &Path) -> Result<String, WorkspaceError> {
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() > MAX_PROJECT_BYTES {
        return Err(WorkspaceError::ProjectTooLarge);
    }
    let mut content = String::with_capacity(metadata.len() as usize);
    File::open(path)?.read_to_string(&mut content)?;
    Ok(content)
}

fn project_validity(raw: &str) -> ProjectValidity {
    let value: Value = match serde_json::from_str(raw) {
        Ok(value) => value,
        Err(_) => return ProjectValidity::Invalid,
    };
    let Some(object) = value.as_object() else {
        return ProjectValidity::Invalid;
    };

    if object
        .get("fileType")
        .and_then(Value::as_str)
        .is_some_and(|value| value == "siteboard-project")
    {
        return match object.get("fileSchemaVersion").and_then(Value::as_u64) {
            Some(1) => ProjectValidity::Current,
            Some(version) if version > 1 => ProjectValidity::Future,
            _ => ProjectValidity::Invalid,
        };
    }

    match object.get("schemaVersion").and_then(Value::as_u64) {
        Some(1 | 2) => ProjectValidity::Current,
        Some(version) if version > 2 => ProjectValidity::Future,
        _ => ProjectValidity::Invalid,
    }
}

fn validate_project_content(content: &str) -> Result<(), WorkspaceError> {
    if content.len() as u64 > MAX_PROJECT_BYTES {
        return Err(WorkspaceError::ProjectTooLarge);
    }
    match project_validity(content) {
        ProjectValidity::Current => Ok(()),
        ProjectValidity::Future => Err(WorkspaceError::FutureProject),
        ProjectValidity::Invalid => Err(WorkspaceError::InvalidProject),
    }
}

fn valid_project_path(path: &Path) -> Result<PathBuf, WorkspaceError> {
    if path.as_os_str().is_empty() || !project_extension(path) {
        return Err(WorkspaceError::InvalidProjectPath);
    }
    Ok(path.to_path_buf())
}

fn normalize_save_project_path(path: &Path) -> Result<PathBuf, WorkspaceError> {
    if path.as_os_str().is_empty() {
        return Err(WorkspaceError::InvalidProjectPath);
    }
    if project_extension(path) {
        return Ok(path.to_path_buf());
    }
    Ok(path.with_extension("siteboard"))
}

fn project_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| {
            value.eq_ignore_ascii_case("siteboard") || value.eq_ignore_ascii_case("json")
        })
}

fn normalize_archive_path(path: &Path) -> Result<PathBuf, WorkspaceError> {
    if path.as_os_str().is_empty() {
        return Err(WorkspaceError::InvalidArchivePath);
    }
    if path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("zip"))
    {
        Ok(path.to_path_buf())
    } else {
        Ok(path.with_extension("zip"))
    }
}

fn normalize_recovery_path(path: &Path) -> Result<PathBuf, WorkspaceError> {
    if path.as_os_str().is_empty() {
        return Err(WorkspaceError::InvalidProjectPath);
    }
    if path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("txt"))
    {
        Ok(path.to_path_buf())
    } else {
        Ok(path.with_extension("txt"))
    }
}

fn backup_path(path: &Path) -> PathBuf {
    let file = path
        .file_name()
        .map(|value| value.to_string_lossy())
        .unwrap_or_else(|| "project.siteboard".into());
    path.with_file_name(format!("{file}.backup"))
}

fn temp_path(path: &Path) -> PathBuf {
    let file = path
        .file_name()
        .map(|value| value.to_string_lossy())
        .unwrap_or_else(|| "siteboard".into());
    path.with_file_name(format!(".{file}.tmp"))
}

fn atomic_write(path: &Path, bytes: &[u8], preserve_backup: bool) -> Result<(), WorkspaceError> {
    let parent = path.parent().ok_or(WorkspaceError::InvalidProjectPath)?;
    fs::create_dir_all(parent)?;
    let temporary = temp_path(path);
    if temporary.exists() {
        fs::remove_file(&temporary)?;
    }

    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;

        let backup = backup_path(path);
        let had_primary = path.exists();
        if preserve_backup && had_primary {
            if backup.exists() {
                fs::remove_file(&backup)?;
            }
            fs::rename(path, &backup)?;
        } else if had_primary {
            fs::remove_file(path)?;
        }

        if let Err(error) = fs::rename(&temporary, path) {
            if preserve_backup && backup.exists() && !path.exists() {
                let _ = fs::rename(&backup, path);
            }
            return Err(error.into());
        }
        sync_directory(parent)?;
        Ok(())
    })();

    if temporary.exists() {
        let _ = fs::remove_file(temporary);
    }
    result
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), WorkspaceError> {
    File::open(path)?.sync_all()?;
    Ok(())
}

#[cfg(not(unix))]
fn sync_directory(_path: &Path) -> Result<(), WorkspaceError> {
    Ok(())
}

fn load_session(app_data: &Path) -> Result<DesktopSession, WorkspaceError> {
    let path = app_data.join(SESSION_FILE);
    if !path.exists() {
        return Ok(DesktopSession::default());
    }
    let raw = fs::read_to_string(path)?;
    let session: DesktopSession = serde_json::from_str(&raw)?;
    if session.schema_version > 1 {
        return Ok(DesktopSession::default());
    }
    Ok(session)
}

fn save_session(app_data: &Path, session: &DesktopSession) -> Result<(), WorkspaceError> {
    let raw = serde_json::to_vec_pretty(session)?;
    atomic_write(&app_data.join(SESSION_FILE), &raw, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc};
    use std::time::Duration;
    use tempfile::tempdir;

    fn project(name: &str) -> String {
        format!(
            r#"{{"fileType":"siteboard-project","fileSchemaVersion":1,"exportedAt":"2026-07-30T00:00:00.000Z","document":{{"schemaVersion":2,"site":{{"name":"{name}"}}}}}}"#
        )
    }

    #[test]
    fn writes_an_autosave_and_keeps_the_previous_revision() {
        let directory = tempdir().unwrap();
        let manager = WorkspaceManager::new(directory.path().into()).unwrap();

        manager.save_active(&project("first"), false).unwrap();
        manager.save_active(&project("second"), false).unwrap();

        let current = fs::read_to_string(directory.path().join(AUTOSAVE_FILE)).unwrap();
        let backup =
            fs::read_to_string(backup_path(&directory.path().join(AUTOSAVE_FILE))).unwrap();
        assert!(current.contains("second"));
        assert!(backup.contains("first"));
    }

    #[test]
    fn refuses_to_replace_a_corrupt_primary_without_explicit_recovery() {
        let directory = tempdir().unwrap();
        let manager = WorkspaceManager::new(directory.path().into()).unwrap();
        let target = directory.path().join(AUTOSAVE_FILE);
        fs::write(&target, "{broken").unwrap();

        let error = manager.save_active(&project("safe"), false).unwrap_err();
        assert!(matches!(error, WorkspaceError::UnsafeReplacement));
        assert_eq!(fs::read_to_string(&target).unwrap(), "{broken");
        assert!(directory.path().join("recovery").is_dir());
    }

    #[test]
    fn loads_the_backup_and_returns_the_original_for_recovery() {
        let directory = tempdir().unwrap();
        let manager = WorkspaceManager::new(directory.path().into()).unwrap();
        let target = directory.path().join(AUTOSAVE_FILE);
        fs::write(&target, "{broken").unwrap();
        fs::write(backup_path(&target), project("backup")).unwrap();

        let loaded = manager.load_workspace().unwrap().unwrap();
        assert_eq!(loaded.source, "backup");
        assert_eq!(loaded.recovery_raw.as_deref(), Some("{broken"));
        assert!(loaded.content.contains("backup"));
    }

    #[test]
    fn loads_autosave_backup_when_a_crash_happens_between_renames() {
        let directory = tempdir().unwrap();
        let manager = WorkspaceManager::new(directory.path().into()).unwrap();
        let target = directory.path().join(AUTOSAVE_FILE);
        fs::write(backup_path(&target), project("survived")).unwrap();

        let loaded = manager.load_workspace().unwrap().unwrap();

        assert_eq!(loaded.source, "backup");
        assert_eq!(loaded.path, target.to_string_lossy());
        assert!(loaded.content.contains("survived"));
        assert!(loaded.recovery_raw.is_none());
    }

    #[test]
    fn loads_named_project_backup_when_a_crash_happens_between_renames() {
        let directory = tempdir().unwrap();
        let manager = WorkspaceManager::new(directory.path().into()).unwrap();
        let target = directory.path().join("client.siteboard");
        manager.save_to(&target, &project("client")).unwrap();
        fs::rename(&target, backup_path(&target)).unwrap();

        let loaded = manager.load_workspace().unwrap().unwrap();

        assert_eq!(loaded.source, "backup");
        assert_eq!(loaded.path, target.to_string_lossy());
        assert!(loaded.content.contains("client"));
    }

    #[test]
    fn serializes_new_project_with_workspace_io() {
        let directory = tempdir().unwrap();
        let manager = Arc::new(WorkspaceManager::new(directory.path().into()).unwrap());
        let active = directory.path().join("client.siteboard");
        manager.save_to(&active, &project("client")).unwrap();

        let io_guard = manager.io.lock().unwrap();
        let (sender, receiver) = mpsc::channel();
        let worker = Arc::clone(&manager);
        let task = std::thread::spawn(move || {
            sender.send(worker.new_project()).unwrap();
        });

        assert!(receiver.recv_timeout(Duration::from_millis(50)).is_err());
        drop(io_guard);
        receiver
            .recv_timeout(Duration::from_secs(1))
            .unwrap()
            .unwrap();
        task.join().unwrap();

        assert!(manager.status().active_project_path.is_none());
    }

    #[test]
    fn adds_expected_extensions_to_new_files() {
        let directory = tempdir().unwrap();
        let project_path =
            normalize_save_project_path(&directory.path().join("client-homepage")).unwrap();
        let archive_path = normalize_archive_path(&directory.path().join("public-build")).unwrap();
        assert_eq!(
            project_path.extension().and_then(|value| value.to_str()),
            Some("siteboard"),
        );
        assert_eq!(
            archive_path.extension().and_then(|value| value.to_str()),
            Some("zip"),
        );
    }
}
