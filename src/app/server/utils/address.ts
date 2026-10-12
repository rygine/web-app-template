import { BlockList, isIPv4, isIPv6 } from "node:net";

// Loopback and RFC 1918 ranges.
const local = new BlockList();
local.addSubnet("127.0.0.0", 8, "ipv4");
local.addSubnet("10.0.0.0", 8, "ipv4");
local.addSubnet("172.16.0.0", 12, "ipv4");
local.addSubnet("192.168.0.0", 16, "ipv4");
local.addAddress("::1", "ipv6");

export const isLocalAddress = (ip: string | undefined): boolean => {
  if (ip === undefined) {
    return false;
  }
  const address = ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
  if (isIPv4(address)) {
    return local.check(address, "ipv4");
  }
  if (isIPv6(address)) {
    return local.check(address, "ipv6");
  }
  return false;
};
