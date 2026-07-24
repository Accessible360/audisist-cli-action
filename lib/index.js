const fs = require("fs");
const os = require("os");
const path = require("path");
const yaml = require("js-yaml");
const core = require("@actions/core");
const exec = require("@actions/exec");

function isTruthy(value) {
  return value === "true";
}

function parseLines(value) {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function resolveWorkspacePath(filePath) {
  if (path.isAbsolute(filePath)) {
    return path.normalize(filePath);
  }

  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  return path.resolve(workspace, filePath);
}

function resolveConfig(config) {
  if (/^\s*[\[{]/.test(config)) {
    const configFile = path.join(os.tmpdir(), "audisist-config.json");
    fs.writeFileSync(configFile, config);
    return configFile;
  }

  return resolveWorkspacePath(config);
}

function parseConfigInput(configInput) {
  if (/^\s*[\[{]/.test(configInput)) {
    return JSON.parse(configInput);
  }

  const configPath = resolveWorkspacePath(configInput);
  const content = fs.readFileSync(configPath, "utf8");

  if (/\.ya?ml$/i.test(configPath)) {
    return yaml.load(content);
  }

  try {
    return JSON.parse(content);
  } catch {
    return yaml.load(content);
  }
}

function collectExpectedOutputs({config, output}) {
  const outputs = [];

  if (config) {
    const parsed = parseConfigInput(config);

    for (const run of parsed.validate || []) {
      if (run.skip || !run.options?.output) {
        continue;
      }

      outputs.push(resolveWorkspacePath(run.options.output));
    }

    return outputs;
  }

  if (output) {
    outputs.push(resolveWorkspacePath(output));
  }

  return outputs;
}

function buildCommand(options) {
  const cmd = ["audisist-cli"];

  if (options.debug) {
    cmd.push("--debug");
  }

  cmd.push("--license", options.license);

  if (options.config) {
    cmd.push("--config", resolveConfig(options.config));
  }

  cmd.push("validate");

  if (options.url) {
    cmd.push(options.url);
  }

  if (options.format) {
    cmd.push("-f", options.format);
  }

  if (options.output) {
    cmd.push("-o", options.output);
  }

  for (const cookie of options.cookies) {
    cmd.push("-c", cookie);
  }

  for (const header of options.headers) {
    cmd.push("-H", header);
  }

  if (options.onBeforeScript) {
    cmd.push("--onBeforeScript", options.onBeforeScript);
  }

  if (options.ignoreResponseCode) {
    cmd.push("--ignoreResponseCode");
  }

  if (options.failOn) {
    cmd.push("--fail-on", options.failOn);
  }

  return cmd;
}

function setActionOutputs(outputPaths) {
  core.setOutput("outputs", JSON.stringify(outputPaths));
}

async function run() {
  const license = core.getInput("license", {required: true});
  const config = core.getInput("config");
  const debug = isTruthy(core.getInput("debug"));
  const url = core.getInput("url");
  const cookies = parseLines(core.getInput("cookies"));
  const headers = parseLines(core.getInput("headers"));
  const format = core.getInput("format");
  const output = core.getInput("output");
  const onBeforeScript = core.getInput("on_before_script");
  const ignoreResponseCode = isTruthy(core.getInput("ignore_response_code"));
  const failOn = core.getInput("fail_on");

  const expectedOutputs = collectExpectedOutputs({config, output});
  const cmd = buildCommand({
    license,
    config,
    debug,
    url,
    cookies,
    headers,
    format,
    output,
    onBeforeScript,
    ignoreResponseCode,
    failOn,
  });

  core.info(`Running: ${cmd.join(" ")}`);

  const exitCode = await exec.exec(cmd[0], cmd.slice(1), {
    silent: !debug,
  });

  if (exitCode !== 0) {
    core.setFailed(`audisist-cli exited with code ${exitCode}`);
    return;
  }

  const writtenOutputs = expectedOutputs.filter((filePath) =>
    fs.existsSync(filePath)
  );

  if (
    expectedOutputs.length &&
    writtenOutputs.length < expectedOutputs.length
  ) {
    const missing = expectedOutputs
      .filter((filePath) => !fs.existsSync(filePath))
      .join(", ");
    core.warning(
      `Expected result file(s) were not found after the scan: ${missing}`
    );
  }

  setActionOutputs(writtenOutputs);
}

module.exports = {
  isTruthy,
  parseLines,
  resolveWorkspacePath,
  resolveConfig,
  parseConfigInput,
  collectExpectedOutputs,
  buildCommand,
};

if (require.main === module) {
  run().catch((error) => {
    core.setFailed(error.message);
  });
}
