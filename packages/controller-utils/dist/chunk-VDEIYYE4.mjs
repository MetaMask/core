import {
  createModuleLogger,
  projectLogger
} from "./chunk-RZFCNKW4.mjs";

// src/siwe.ts
import { remove0x } from "@metamask/utils";
import { ParsedMessage } from "@spruceid/siwe-parser";
var log = createModuleLogger(projectLogger, "detect-siwe");
function safeStripHexPrefix(str) {
  if (typeof str !== "string") {
    return str;
  }
  return remove0x(str);
}
function msgHexToText(hex) {
  try {
    const stripped = safeStripHexPrefix(hex);
    const buff = Buffer.from(stripped, "hex");
    return buff.length === 32 ? hex : buff.toString("utf8");
  } catch (e) {
    log(e);
    return hex;
  }
}
var DEFAULT_PORTS_BY_PROTOCOL = {
  "http:": "80",
  "https:": "443"
};
var parseDomainParts = (domain, originProtocol) => {
  if (domain.match(/^[^/:]*:\/\//u)) {
    return new URL(domain);
  }
  return new URL(`${originProtocol}//${domain}`);
};
var isValidSIWEOrigin = (req) => {
  try {
    const { origin, siwe } = req;
    if (!origin || !siwe?.parsedMessage?.domain) {
      return false;
    }
    const originParts = new URL(origin);
    const domainParts = parseDomainParts(
      siwe.parsedMessage.domain,
      originParts.protocol
    );
    if (domainParts.hostname.localeCompare(originParts.hostname, void 0, {
      sensitivity: "accent"
    }) !== 0) {
      return false;
    }
    if (domainParts.port !== "" && domainParts.port !== originParts.port) {
      return originParts.port === "" && domainParts.port === DEFAULT_PORTS_BY_PROTOCOL[originParts.protocol];
    }
    if (domainParts.username !== "" && domainParts.username !== originParts.username) {
      return false;
    }
    return true;
  } catch (e) {
    log(e);
    return false;
  }
};
var detectSIWE = (msgParams) => {
  try {
    const { data } = msgParams;
    const message = msgHexToText(data);
    const parsedMessage = new ParsedMessage(message);
    return {
      isSIWEMessage: true,
      parsedMessage
    };
  } catch (error) {
    return {
      isSIWEMessage: false,
      parsedMessage: null
    };
  }
};

export {
  parseDomainParts,
  isValidSIWEOrigin,
  detectSIWE
};
//# sourceMappingURL=chunk-VDEIYYE4.mjs.map