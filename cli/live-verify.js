import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const IPV4_RESERVED_RANGES = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.31.196.0", 24],
  ["192.52.193.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["192.175.48.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
].map(([address, prefix]) => [ipv4Number(address), prefix]);
const IPV6_RESERVED_RANGES = [
  ["::", 96],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
];
const ipv6Reserved = new BlockList();
for (const [address, prefix] of IPV6_RESERVED_RANGES) {
  ipv6Reserved.addSubnet(address, prefix, "ipv6");
}

function ipv4Number(address) {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some(
      (part) => !Number.isInteger(part) || part < 0 || part > 255,
    )
  ) {
    return null;
  }
  return (
    ((parts[0] << 24) |
      (parts[1] << 16) |
      (parts[2] << 8) |
      parts[3]) >>>
    0
  );
}

function reservedIpv4(address) {
  const value = ipv4Number(address);
  if (value === null) return true;
  return IPV4_RESERVED_RANGES.some(([base, prefix]) => {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (base & mask);
  });
}

function reservedIpv6(address) {
  const normalized = address.toLowerCase().split("%", 1)[0];
  try {
    return ipv6Reserved.check(normalized, "ipv6");
  } catch {
    return true;
  }
}

export function isPrivateAddress(address) {
  const normalized =
    typeof address === "string" ? address.replace(/^\[|\]$/g, "") : "";
  const family = isIP(normalized);
  if (family === 4) return reservedIpv4(normalized);
  if (family === 6) return reservedIpv6(normalized);
  return true;
}

function parseHttpsUrl(value, { rootOnly = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("배포 주소가 올바르지 않습니다.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    (rootOnly &&
      ((url.pathname !== "/" && url.pathname !== "") || url.search))
  ) {
    throw new Error(
      rootOnly
        ? "경로가 없는 공개 HTTPS 주소만 확인할 수 있습니다."
        : "공개 HTTPS 주소만 확인할 수 있습니다.",
    );
  }
  return url;
}

async function assertPublicHost(url, lookupImpl) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookupImpl(hostname, { all: true, verbatim: true });
  if (
    !Array.isArray(addresses) ||
    !addresses.length ||
    addresses.some((entry) => isPrivateAddress(entry?.address))
  ) {
    throw new Error("로컬, 사설 또는 예약된 네트워크 주소는 확인할 수 없습니다.");
  }
  return url;
}

export async function assertPublicHttpsUrl(
  value,
  { lookupImpl = lookup } = {},
) {
  return assertPublicHost(parseHttpsUrl(value, { rootOnly: true }), lookupImpl);
}

async function fetchWithValidatedRedirects(
  value,
  request,
  {
    fetchImpl,
    lookupImpl,
    maxRedirects = 5,
    sameOriginOnly = false,
  },
) {
  let current = parseHttpsUrl(value);
  const initialOrigin = current.origin;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    await assertPublicHost(current, lookupImpl);
    if (sameOriginOnly && current.origin !== initialOrigin) {
      throw new Error("고정 배포 주소가 다른 출처로 이동했습니다.");
    }

    const response = await fetchImpl(current, {
      ...request,
      redirect: "manual",
    });
    if (response.redirected) {
      throw new Error("검사하지 않은 자동 리디렉션 응답을 거절했습니다.");
    }

    if (!REDIRECT_STATUSES.has(response.status)) {
      if (response.url) {
        const responseUrl = parseHttpsUrl(response.url);
        await assertPublicHost(responseUrl, lookupImpl);
        if (sameOriginOnly && responseUrl.origin !== initialOrigin) {
          throw new Error("고정 배포 주소가 다른 출처로 이동했습니다.");
        }
        current = responseUrl;
      }
      return { response, url: current };
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error("리디렉션 응답에 이동할 주소가 없습니다.");
    }
    if (redirectCount === maxRedirects) {
      throw new Error("공개 주소의 리디렉션이 너무 많습니다.");
    }
    current = parseHttpsUrl(new URL(location, current).href);
  }

  throw new Error("공개 주소의 리디렉션을 확인하지 못했습니다.");
}

async function readRevisionMarker(response) {
  if (!response.ok) return null;
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > 4_096) return null;
  const raw = await response.text();
  if (raw.length > 4_096) return null;
  try {
    const marker = JSON.parse(raw);
    return marker?.schemaVersion === 1 &&
      typeof marker.revision === "string" &&
      /^[a-f0-9]{64}$/.test(marker.revision)
      ? marker
      : null;
  } catch {
    return null;
  }
}

async function verifyRevision(
  value,
  {
    fetchImpl,
    lookupImpl,
    attempts,
    wait,
    expectedRevision = "",
    expectedCommitHash = "",
    sameOriginOnly = false,
  },
) {
  const origin = parseHttpsUrl(value, { rootOnly: true });
  const markerUrl = new URL("/siteboard-revision.json", origin);
  let lastStatus = 0;
  let lastMessage = "";

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const request = {
        method: "GET",
        cache: "no-store",
        headers: { "User-Agent": "Siteboard-Companion/4" },
        signal: AbortSignal.timeout(10_000),
      };
      const [pageResult, markerResult] = await Promise.all([
        fetchWithValidatedRedirects(origin, request, {
          fetchImpl,
          lookupImpl,
          sameOriginOnly,
        }),
        fetchWithValidatedRedirects(markerUrl, request, {
          fetchImpl,
          lookupImpl,
          sameOriginOnly,
        }),
      ]);
      const pageResponse = pageResult.response;
      const markerResponse = markerResult.response;
      lastStatus = pageResponse.status;
      const marker = await readRevisionMarker(markerResponse);
      const revisionMatches =
        marker &&
        (expectedRevision
          ? marker.revision === expectedRevision
          : marker.revision.startsWith(expectedCommitHash));
      const sameFinalOrigin =
        pageResult.url.origin === markerResult.url.origin;
      if (
        pageResponse.ok &&
        markerResponse.ok &&
        sameFinalOrigin &&
        revisionMatches
      ) {
        return {
          ok: true,
          checkedAt: new Date().toISOString(),
          status: pageResponse.status,
          url: pageResult.url.href,
          revision: marker.revision,
        };
      }
      lastMessage = !pageResponse.ok
        ? `홈페이지 HTTP ${pageResponse.status}`
        : !markerResponse.ok
          ? `리비전 확인 HTTP ${markerResponse.status}`
          : !sameFinalOrigin
            ? "홈페이지와 리비전 표식의 최종 출처가 다릅니다."
          : "공개 리비전이 기대값과 다릅니다.";
    } catch (error) {
      lastMessage =
        error instanceof Error ? error.message.slice(0, 200) : "연결 실패";
    }
    if (attempt < attempts - 1) {
      await wait(300 * 2 ** attempt);
    }
  }

  return {
    ok: false,
    checkedAt: new Date().toISOString(),
    status: lastStatus,
    url: origin.href,
    message: lastMessage || "공개 주소 응답을 확인하지 못했습니다.",
  };
}

export async function verifyLiveUrl(
  value,
  {
    fetchImpl = fetch,
    lookupImpl = lookup,
    expectedRevision = "",
    attempts = 4,
    wait = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {},
) {
  if (!/^[a-f0-9]{64}$/.test(expectedRevision)) {
    throw new Error("확인할 배포 리비전이 올바르지 않습니다.");
  }
  return verifyRevision(value, {
    fetchImpl,
    lookupImpl,
    attempts,
    wait,
    expectedRevision,
  });
}

export async function verifyImmutableDeployment(
  value,
  {
    fetchImpl = fetch,
    lookupImpl = lookup,
    expectedCommitHash = "",
    attempts = 2,
    wait = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {},
) {
  if (!/^[a-f0-9]{40}$/.test(expectedCommitHash)) {
    throw new Error("복구 대상의 Cloudflare 리비전이 올바르지 않습니다.");
  }
  return verifyRevision(value, {
    fetchImpl,
    lookupImpl,
    attempts,
    wait,
    expectedCommitHash,
    sameOriginOnly: true,
  });
}
