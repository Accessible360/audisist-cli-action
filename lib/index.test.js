const fs = require("fs");
const os = require("os");
const path = require("path");
const {test, before, after} = require("node:test");
const assert = require("node:assert/strict");

const {
  isTruthy,
  parseLines,
  resolveWorkspacePath,
  resolveConfig,
  parseConfigInput,
  collectExpectedOutputs,
  buildCommand,
} = require("./index.js");

const fixturesDir = path.join(__dirname, "fixtures");
const originalWorkspace = process.env.GITHUB_WORKSPACE;

before(() => {
  process.env.GITHUB_WORKSPACE = fixturesDir;
});

after(() => {
  if (originalWorkspace === undefined) {
    delete process.env.GITHUB_WORKSPACE;
  } else {
    process.env.GITHUB_WORKSPACE = originalWorkspace;
  }
});

test('isTruthy returns true only for the string "true"', () => {
  assert.equal(isTruthy("true"), true);
  assert.equal(isTruthy("false"), false);
  assert.equal(isTruthy(""), false);
  assert.equal(isTruthy(undefined), false);
});

test("parseLines splits multiline input and trims empty lines", () => {
  assert.deepEqual(parseLines("session=abc\n\nauth=token"), [
    "session=abc",
    "auth=token",
  ]);
  assert.deepEqual(parseLines(""), []);
  assert.deepEqual(parseLines(undefined), []);
});

test("resolveWorkspacePath resolves relative paths against GITHUB_WORKSPACE", () => {
  const resolved = resolveWorkspacePath("./results/home.json");
  assert.equal(resolved, path.resolve(fixturesDir, "./results/home.json"));
});

test("resolveWorkspacePath normalizes absolute paths", () => {
  const absolute = path.join(fixturesDir, "config.json");
  assert.equal(resolveWorkspacePath(absolute), path.normalize(absolute));
});

test("resolveConfig writes inline JSON to a temp file", () => {
  const inlineConfig = '{"validate":[]}';
  const resolved = resolveConfig(inlineConfig);

  assert.ok(path.isAbsolute(resolved));
  assert.equal(fs.readFileSync(resolved, "utf8"), inlineConfig);
});

test("resolveConfig returns workspace path for file references", () => {
  const configPath = "config.json";
  assert.equal(resolveConfig(configPath), resolveWorkspacePath(configPath));
});

test("parseConfigInput parses inline JSON", () => {
  const parsed = parseConfigInput(
    '{"validate":[{"url":"https://example.com"}]}'
  );
  assert.deepEqual(parsed, {validate: [{url: "https://example.com"}]});
});

test("parseConfigInput parses JSON config files", () => {
  const parsed = parseConfigInput("config.json");
  assert.equal(parsed.validate.length, 3);
  assert.equal(parsed.validate[0].url, "https://example.com");
});

test("parseConfigInput parses YAML config files", () => {
  const parsed = parseConfigInput("config.yml");
  assert.equal(parsed.validate.length, 1);
  assert.equal(parsed.validate[0].options.format, "xunit");
});

test("collectExpectedOutputs collects output paths from config, skipping skipped runs", () => {
  const outputs = collectExpectedOutputs({config: "config.json"});

  assert.deepEqual(outputs, [
    resolveWorkspacePath("./results/home.json"),
    resolveWorkspacePath("./results/contact.json"),
  ]);
});

test("collectExpectedOutputs uses the output input when no config is provided", () => {
  const outputs = collectExpectedOutputs({output: "scan-results.json"});
  assert.deepEqual(outputs, [resolveWorkspacePath("scan-results.json")]);
});

test("collectExpectedOutputs returns an empty array when no outputs are configured", () => {
  assert.deepEqual(collectExpectedOutputs({}), []);
});

test("buildCommand assembles the audisist-cli validate command", () => {
  const cmd = buildCommand({
    license: "license-token",
    config: "config.json",
    debug: true,
    url: "https://example.com",
    format: "json",
    output: "results.json",
    cookies: ["session=abc"],
    headers: ["Authorization: Bearer token"],
    onBeforeScript: "./prepare.js",
    ignoreResponseCode: true,
  });

  assert.deepEqual(cmd.slice(0, 3), ["npx", "audisist-cli", "--debug"]);
  assert.ok(cmd.includes("--license"));
  assert.ok(cmd.includes("license-token"));
  assert.ok(cmd.includes("--config"));
  assert.ok(cmd.includes(resolveConfig("config.json")));
  assert.ok(cmd.includes("validate"));
  assert.ok(cmd.includes("https://example.com"));
  assert.ok(cmd.includes("-f"));
  assert.ok(cmd.includes("json"));
  assert.ok(cmd.includes("-o"));
  assert.ok(cmd.includes("results.json"));
  assert.ok(cmd.includes("-c"));
  assert.ok(cmd.includes("session=abc"));
  assert.ok(cmd.includes("-H"));
  assert.ok(cmd.includes("Authorization: Bearer token"));
  assert.ok(cmd.includes("--onBeforeScript"));
  assert.ok(cmd.includes("./prepare.js"));
  assert.ok(cmd.includes("--ignoreResponseCode"));
});

test("buildCommand omits optional flags when not provided", () => {
  const cmd = buildCommand({
    license: "license-token",
    debug: false,
    cookies: [],
    headers: [],
  });

  assert.deepEqual(cmd, [
    "npx",
    "audisist-cli",
    "--license",
    "license-token",
    "validate",
  ]);
});

test("buildCommand writes inline JSON config to a temp file", () => {
  const inlineConfig = '{"validate":[]}';
  const cmd = buildCommand({
    license: "license-token",
    config: inlineConfig,
    debug: false,
    cookies: [],
    headers: [],
  });

  const configIndex = cmd.indexOf("--config");
  const configPath = cmd[configIndex + 1];

  assert.ok(configPath.startsWith(os.tmpdir()));
  assert.equal(fs.readFileSync(configPath, "utf8"), inlineConfig);
});

test("action.yml maps composite inputs to INPUT_* env vars for @actions/core", () => {
  const actionYml = fs.readFileSync(
    path.join(__dirname, "..", "action.yml"),
    "utf8"
  );

  const requiredInputs = [
    "INPUT_LICENSE",
    "INPUT_CONFIG",
    "INPUT_DEBUG",
    "INPUT_URL",
    "INPUT_COOKIES",
    "INPUT_HEADERS",
    "INPUT_FORMAT",
    "INPUT_OUTPUT",
    "INPUT_ON_BEFORE_SCRIPT",
    "INPUT_IGNORE_RESPONSE_CODE",
  ];

  for (const input of requiredInputs) {
    assert.match(actionYml, new RegExp(`${input}:`));
  }
});
