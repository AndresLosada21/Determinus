// scripts/validate.ts
import { readFileSync as readFileSync2, readdirSync as readdirSync2, existsSync as existsSync2 } from "fs";
import { homedir } from "os";
import { join as join2, resolve as resolve2 } from "path";
import { spawnSync } from "child_process";

// scripts/installer-core.ts
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  readdirSync,
  lstatSync
} from "fs";
import { resolve, join, dirname, relative, isAbsolute } from "path";
import { createHash, randomBytes } from "crypto";

// node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/scanner.js
var CharacterCodes;
(function(CharacterCodes2) {
  CharacterCodes2[CharacterCodes2["lineFeed"] = 10] = "lineFeed";
  CharacterCodes2[CharacterCodes2["carriageReturn"] = 13] = "carriageReturn";
  CharacterCodes2[CharacterCodes2["space"] = 32] = "space";
  CharacterCodes2[CharacterCodes2["_0"] = 48] = "_0";
  CharacterCodes2[CharacterCodes2["_1"] = 49] = "_1";
  CharacterCodes2[CharacterCodes2["_2"] = 50] = "_2";
  CharacterCodes2[CharacterCodes2["_3"] = 51] = "_3";
  CharacterCodes2[CharacterCodes2["_4"] = 52] = "_4";
  CharacterCodes2[CharacterCodes2["_5"] = 53] = "_5";
  CharacterCodes2[CharacterCodes2["_6"] = 54] = "_6";
  CharacterCodes2[CharacterCodes2["_7"] = 55] = "_7";
  CharacterCodes2[CharacterCodes2["_8"] = 56] = "_8";
  CharacterCodes2[CharacterCodes2["_9"] = 57] = "_9";
  CharacterCodes2[CharacterCodes2["a"] = 97] = "a";
  CharacterCodes2[CharacterCodes2["b"] = 98] = "b";
  CharacterCodes2[CharacterCodes2["c"] = 99] = "c";
  CharacterCodes2[CharacterCodes2["d"] = 100] = "d";
  CharacterCodes2[CharacterCodes2["e"] = 101] = "e";
  CharacterCodes2[CharacterCodes2["f"] = 102] = "f";
  CharacterCodes2[CharacterCodes2["g"] = 103] = "g";
  CharacterCodes2[CharacterCodes2["h"] = 104] = "h";
  CharacterCodes2[CharacterCodes2["i"] = 105] = "i";
  CharacterCodes2[CharacterCodes2["j"] = 106] = "j";
  CharacterCodes2[CharacterCodes2["k"] = 107] = "k";
  CharacterCodes2[CharacterCodes2["l"] = 108] = "l";
  CharacterCodes2[CharacterCodes2["m"] = 109] = "m";
  CharacterCodes2[CharacterCodes2["n"] = 110] = "n";
  CharacterCodes2[CharacterCodes2["o"] = 111] = "o";
  CharacterCodes2[CharacterCodes2["p"] = 112] = "p";
  CharacterCodes2[CharacterCodes2["q"] = 113] = "q";
  CharacterCodes2[CharacterCodes2["r"] = 114] = "r";
  CharacterCodes2[CharacterCodes2["s"] = 115] = "s";
  CharacterCodes2[CharacterCodes2["t"] = 116] = "t";
  CharacterCodes2[CharacterCodes2["u"] = 117] = "u";
  CharacterCodes2[CharacterCodes2["v"] = 118] = "v";
  CharacterCodes2[CharacterCodes2["w"] = 119] = "w";
  CharacterCodes2[CharacterCodes2["x"] = 120] = "x";
  CharacterCodes2[CharacterCodes2["y"] = 121] = "y";
  CharacterCodes2[CharacterCodes2["z"] = 122] = "z";
  CharacterCodes2[CharacterCodes2["A"] = 65] = "A";
  CharacterCodes2[CharacterCodes2["B"] = 66] = "B";
  CharacterCodes2[CharacterCodes2["C"] = 67] = "C";
  CharacterCodes2[CharacterCodes2["D"] = 68] = "D";
  CharacterCodes2[CharacterCodes2["E"] = 69] = "E";
  CharacterCodes2[CharacterCodes2["F"] = 70] = "F";
  CharacterCodes2[CharacterCodes2["G"] = 71] = "G";
  CharacterCodes2[CharacterCodes2["H"] = 72] = "H";
  CharacterCodes2[CharacterCodes2["I"] = 73] = "I";
  CharacterCodes2[CharacterCodes2["J"] = 74] = "J";
  CharacterCodes2[CharacterCodes2["K"] = 75] = "K";
  CharacterCodes2[CharacterCodes2["L"] = 76] = "L";
  CharacterCodes2[CharacterCodes2["M"] = 77] = "M";
  CharacterCodes2[CharacterCodes2["N"] = 78] = "N";
  CharacterCodes2[CharacterCodes2["O"] = 79] = "O";
  CharacterCodes2[CharacterCodes2["P"] = 80] = "P";
  CharacterCodes2[CharacterCodes2["Q"] = 81] = "Q";
  CharacterCodes2[CharacterCodes2["R"] = 82] = "R";
  CharacterCodes2[CharacterCodes2["S"] = 83] = "S";
  CharacterCodes2[CharacterCodes2["T"] = 84] = "T";
  CharacterCodes2[CharacterCodes2["U"] = 85] = "U";
  CharacterCodes2[CharacterCodes2["V"] = 86] = "V";
  CharacterCodes2[CharacterCodes2["W"] = 87] = "W";
  CharacterCodes2[CharacterCodes2["X"] = 88] = "X";
  CharacterCodes2[CharacterCodes2["Y"] = 89] = "Y";
  CharacterCodes2[CharacterCodes2["Z"] = 90] = "Z";
  CharacterCodes2[CharacterCodes2["asterisk"] = 42] = "asterisk";
  CharacterCodes2[CharacterCodes2["backslash"] = 92] = "backslash";
  CharacterCodes2[CharacterCodes2["closeBrace"] = 125] = "closeBrace";
  CharacterCodes2[CharacterCodes2["closeBracket"] = 93] = "closeBracket";
  CharacterCodes2[CharacterCodes2["colon"] = 58] = "colon";
  CharacterCodes2[CharacterCodes2["comma"] = 44] = "comma";
  CharacterCodes2[CharacterCodes2["dot"] = 46] = "dot";
  CharacterCodes2[CharacterCodes2["doubleQuote"] = 34] = "doubleQuote";
  CharacterCodes2[CharacterCodes2["minus"] = 45] = "minus";
  CharacterCodes2[CharacterCodes2["openBrace"] = 123] = "openBrace";
  CharacterCodes2[CharacterCodes2["openBracket"] = 91] = "openBracket";
  CharacterCodes2[CharacterCodes2["plus"] = 43] = "plus";
  CharacterCodes2[CharacterCodes2["slash"] = 47] = "slash";
  CharacterCodes2[CharacterCodes2["formFeed"] = 12] = "formFeed";
  CharacterCodes2[CharacterCodes2["tab"] = 9] = "tab";
})(CharacterCodes || (CharacterCodes = {}));

// node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/string-intern.js
var cachedSpaces = new Array(20).fill(0).map((_, index) => {
  return " ".repeat(index);
});
var maxCachedValues = 200;
var cachedBreakLinesWithSpaces = {
  " ": {
    "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\n" + " ".repeat(index);
    }),
    "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r" + " ".repeat(index);
    }),
    "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r\n" + " ".repeat(index);
    })
  },
  "	": {
    "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\n" + "	".repeat(index);
    }),
    "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r" + "	".repeat(index);
    }),
    "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r\n" + "	".repeat(index);
    })
  }
};

// node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/parser.js
var ParseOptions;
(function(ParseOptions2) {
  ParseOptions2.DEFAULT = {
    allowTrailingComma: false
  };
})(ParseOptions || (ParseOptions = {}));

// node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/main.js
var ScanError;
(function(ScanError2) {
  ScanError2[ScanError2["None"] = 0] = "None";
  ScanError2[ScanError2["UnexpectedEndOfComment"] = 1] = "UnexpectedEndOfComment";
  ScanError2[ScanError2["UnexpectedEndOfString"] = 2] = "UnexpectedEndOfString";
  ScanError2[ScanError2["UnexpectedEndOfNumber"] = 3] = "UnexpectedEndOfNumber";
  ScanError2[ScanError2["InvalidUnicode"] = 4] = "InvalidUnicode";
  ScanError2[ScanError2["InvalidEscapeCharacter"] = 5] = "InvalidEscapeCharacter";
  ScanError2[ScanError2["InvalidCharacter"] = 6] = "InvalidCharacter";
})(ScanError || (ScanError = {}));
var SyntaxKind;
(function(SyntaxKind2) {
  SyntaxKind2[SyntaxKind2["OpenBraceToken"] = 1] = "OpenBraceToken";
  SyntaxKind2[SyntaxKind2["CloseBraceToken"] = 2] = "CloseBraceToken";
  SyntaxKind2[SyntaxKind2["OpenBracketToken"] = 3] = "OpenBracketToken";
  SyntaxKind2[SyntaxKind2["CloseBracketToken"] = 4] = "CloseBracketToken";
  SyntaxKind2[SyntaxKind2["CommaToken"] = 5] = "CommaToken";
  SyntaxKind2[SyntaxKind2["ColonToken"] = 6] = "ColonToken";
  SyntaxKind2[SyntaxKind2["NullKeyword"] = 7] = "NullKeyword";
  SyntaxKind2[SyntaxKind2["TrueKeyword"] = 8] = "TrueKeyword";
  SyntaxKind2[SyntaxKind2["FalseKeyword"] = 9] = "FalseKeyword";
  SyntaxKind2[SyntaxKind2["StringLiteral"] = 10] = "StringLiteral";
  SyntaxKind2[SyntaxKind2["NumericLiteral"] = 11] = "NumericLiteral";
  SyntaxKind2[SyntaxKind2["LineCommentTrivia"] = 12] = "LineCommentTrivia";
  SyntaxKind2[SyntaxKind2["BlockCommentTrivia"] = 13] = "BlockCommentTrivia";
  SyntaxKind2[SyntaxKind2["LineBreakTrivia"] = 14] = "LineBreakTrivia";
  SyntaxKind2[SyntaxKind2["Trivia"] = 15] = "Trivia";
  SyntaxKind2[SyntaxKind2["Unknown"] = 16] = "Unknown";
  SyntaxKind2[SyntaxKind2["EOF"] = 17] = "EOF";
})(SyntaxKind || (SyntaxKind = {}));
var ParseErrorCode;
(function(ParseErrorCode2) {
  ParseErrorCode2[ParseErrorCode2["InvalidSymbol"] = 1] = "InvalidSymbol";
  ParseErrorCode2[ParseErrorCode2["InvalidNumberFormat"] = 2] = "InvalidNumberFormat";
  ParseErrorCode2[ParseErrorCode2["PropertyNameExpected"] = 3] = "PropertyNameExpected";
  ParseErrorCode2[ParseErrorCode2["ValueExpected"] = 4] = "ValueExpected";
  ParseErrorCode2[ParseErrorCode2["ColonExpected"] = 5] = "ColonExpected";
  ParseErrorCode2[ParseErrorCode2["CommaExpected"] = 6] = "CommaExpected";
  ParseErrorCode2[ParseErrorCode2["CloseBraceExpected"] = 7] = "CloseBraceExpected";
  ParseErrorCode2[ParseErrorCode2["CloseBracketExpected"] = 8] = "CloseBracketExpected";
  ParseErrorCode2[ParseErrorCode2["EndOfFileExpected"] = 9] = "EndOfFileExpected";
  ParseErrorCode2[ParseErrorCode2["InvalidCommentToken"] = 10] = "InvalidCommentToken";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfComment"] = 11] = "UnexpectedEndOfComment";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfString"] = 12] = "UnexpectedEndOfString";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfNumber"] = 13] = "UnexpectedEndOfNumber";
  ParseErrorCode2[ParseErrorCode2["InvalidUnicode"] = 14] = "InvalidUnicode";
  ParseErrorCode2[ParseErrorCode2["InvalidEscapeCharacter"] = 15] = "InvalidEscapeCharacter";
  ParseErrorCode2[ParseErrorCode2["InvalidCharacter"] = 16] = "InvalidCharacter";
})(ParseErrorCode || (ParseErrorCode = {}));

// scripts/installer-core.ts
var sha = (x) => createHash("sha256").update(x).digest("hex");
function verifyRelease(root) {
  const manifest = JSON.parse(
    readFileSync(join(root, "release-manifest.json"), "utf8")
  );
  if (manifest.version !== "3.0.4" || !manifest.files || typeof manifest.files !== "object")
    throw Error("Unsupported release manifest");
  for (const [name, hash] of Object.entries(manifest.files)) {
    const file = resolve(root, name), rel = relative(root, file);
    if (isAbsolute(name) || rel.startsWith("..") || isAbsolute(rel) || !existsSync(file) || lstatSync(file).isSymbolicLink())
      throw Error("Unsafe or missing release file: " + name);
    if (sha(readFileSync(file)) !== hash)
      throw Error("Release checksum mismatch: " + name);
  }
  const bundle = JSON.parse(
    readFileSync(join(root, "plugin/dist/plugin-bundle-manifest.json"), "utf8")
  );
  for (const [name, hash] of Object.entries(bundle.files)) {
    if (!/^[a-z-]+$/.test(name) || sha(readFileSync(join(root, "plugin/dist", name + ".js"))) !== hash)
      throw Error("Bundle checksum mismatch");
  }
  return {
    manifest,
    bundle,
    identity: sha(readFileSync(join(root, "release-manifest.json"))).slice(
      0,
      16
    )
  };
}

// scripts/validate.ts
var args = process.argv.slice(2);
var get = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : void 0;
};
try {
  const root = join2(
    resolve2(get("--home") ?? homedir()),
    ".local/share/Determinus"
  ), receipt = JSON.parse(readFileSync2(join2(root, "installed.json"), "utf8"));
  verifyRelease(receipt.target);
  const dir = join2(root, "diagnostics"), files = existsSync2(dir) ? readdirSync2(dir).filter((x) => /^cache-.+\.json$/.test(x)) : [];
  const reports = files.flatMap((name) => {
    try {
      const r = JSON.parse(readFileSync2(join2(dir, name), "utf8"));
      if (r.version !== "3.0.4" || r.generation !== receipt.generation || !r.active || Date.parse(r.startedAt) < Date.parse(receipt.installedAt))
        return [];
      try {
        process.kill(r.pid, 0);
      } catch {
        return [];
      }
      return [r];
    } catch {
      return [];
    }
  });
  const cli = spawnSync(
    get("--cli") ?? (process.platform === "win32" ? "opencode2.exe" : "opencode2"),
    ["api", "get", "/api/plugin"],
    {
      encoding: "utf8",
      timeout: 15e3,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024
    }
  );
  const states = [];
  const walk = (x) => {
    if (!x || typeof x !== "object") return;
    if (x.id === "determinus" && x.state) states.push(x);
    for (const v of Object.values(x)) if (v && typeof v === "object") walk(v);
  };
  try {
    walk(JSON.parse(cli.stdout));
  } catch {
  }
  const canonical = (x) => x.replace(/\\/g, "/").toLowerCase();
  const entryRoot = canonical(receipt.entry);
  const active = states.some(
    (x) => x.state.status === "active" && typeof x.source?.path === "string" && (canonical(x.source.path) === entryRoot || canonical(x.source.path).startsWith(entryRoot + "/"))
  );
  const services = ["go", "zen"].map((service) => {
    const samples = reports.flatMap((r) => r.samples ?? []).filter((x) => x.service === service), valid = samples.filter(
      (x) => x.sessionPresent && x.userAgentPresent && x.status >= 200 && x.status < 300
    );
    const groups = /* @__PURE__ */ new Map();
    for (const x of valid)
      if (x.identitySource !== "standalone-operation" && typeof x.sessionHash === "string")
        groups.set(x.sessionHash, (groups.get(x.sessionHash) ?? 0) + 1);
    return {
      service,
      observed: samples.length,
      valid2xx: valid.length,
      repeatedSession: [...groups.values()].some((x) => x >= 2),
      standalone: valid.filter(
        (x) => x.identitySource === "standalone-operation"
      ).length,
      usageSteps: reports.reduce(
        (n, r) => n + (r.usageByService?.[service]?.steps ?? 0),
        0
      ),
      cacheReadTokens: reports.reduce(
        (n, r) => n + (r.usageByService?.[service]?.cacheReadTokens ?? 0),
        0
      )
    };
  });
  const required = (get("--require") ?? "go").split(",");
  if (required.some((x) => !["go", "zen"].includes(x)))
    throw Error("--require accepts go, zen or go,zen");
  const traffic = required.every((service) => {
    const s = services.find((x) => x.service === service);
    return s && s.repeatedSession && s.usageSteps >= 2 && s.cacheReadTokens > 0;
  });
  const passed = active && reports.length > 0 && traffic;
  console.log(
    JSON.stringify(
      {
        version: receipt.version,
        installIntegrity: "verified",
        pluginState: active ? "active" : "not-confirmed",
        cliExitCode: cli.status,
        cliError: cli.error?.code,
        currentRuntimeReports: reports.length,
        services,
        usageSteps: reports.reduce((n, r) => n + (r.usageSteps ?? 0), 0),
        cacheReadTokens: reports.reduce(
          (n, r) => n + (r.cacheReadTokens ?? 0),
          0
        ),
        result: passed ? "DETERMINUS_RUNTIME_AND_CACHE_OBSERVED" : "DETERMINUS_VALIDATION_PENDING",
        note: "Observed traffic applies to this loaded generation, not all future requests or calls bypassing the catalog."
      },
      null,
      2
    )
  );
  if (!passed) process.exitCode = 2;
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
