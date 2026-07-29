import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function privateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] >= 224
  );
}

export function isPrivateAddress(address) {
  const family = isIP(address);
  if (family === 4) return privateIpv4(address);
  if (family === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }
  return true;
}

export async function assertPublicHttpsUrl(
  value,
  { lookupImpl = lookup } = {},
) {
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
    url.port
  ) {
    throw new Error("공개 HTTPS 배포 주소만 확인할 수 있습니다.");
  }
  const addresses = await lookupImpl(url.hostname, {
    all: true,
    verbatim: true,
  });
  if (
    !Array.isArray(addresses) ||
    !addresses.length ||
    addresses.some((entry) => isPrivateAddress(entry.address))
  ) {
    throw new Error("로컬 또는 사설 네트워크 주소는 확인할 수 없습니다.");
  }
  return url;
}

export async function verifyLiveUrl(
  value,
  {
    fetchImpl = fetch,
    lookupImpl = lookup,
    attempts = 4,
    wait = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {},
) {
  const url = await assertPublicHttpsUrl(value, { lookupImpl });
  let lastStatus = 0;
  let lastMessage = "";

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        headers: { "User-Agent": "Siteboard-Companion/3" },
        signal: AbortSignal.timeout(10_000),
      });
      lastStatus = response.status;
      if (response.ok) {
        return {
          ok: true,
          checkedAt: new Date().toISOString(),
          status: response.status,
          url: response.url || url.href,
        };
      }
      lastMessage = `HTTP ${response.status}`;
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
    url: url.href,
    message: lastMessage || "공개 주소 응답을 확인하지 못했습니다.",
  };
}
