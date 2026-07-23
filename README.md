# Accessibility scanning powered by Allyant

Run accessibility scans in your GitHub Action workflows, powered by [Allyant](https://allyant.com)

This action installs `@accessible360/audisist-cli` and runs scans against configured URLs

## Prerequisites

You need two credentials:

| Credential | Input | Purpose |
| --- | --- | --- |
| NPM Auth Token | `auth_token` | Needed in order to install the `@accessible360/audisist-cli` package |
| License token | `license` | A license token provided by Allyant, allowing you to run accessibility scans |

Add both as Repo or Org level secrets before using the action.

## Quick start

```yaml
name: Accessibility

on:
  pull_request:

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: Accessible360/audisist-cli-action@v1
        with:
          auth_token: ${{ secrets.AUDISIST_NPM_TOKEN }}
          license: ${{ secrets.AUDISIST_LICENSE }}
          url: https://example.com
          format: xunit
          output: accessibility-results.xml
```

Note: If `output` is not set, results are printed to the workflow log (stdout)

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `auth_token` | Yes | — | NPM token used to install `@accessible360/audisist-cli` |
| `license` | Yes | — | Valid license token required to use `audisist-cli` |
| `cli_version` | No | `latest` | Version of `@accessible360/audisist-cli` to install |
| `config` | No | — | Path to a JSON or YAML config file, or an inline JSON string |
| `url` | No | — | URL to scan |
| `format` | No | `xunit` | Output format: `xunit`, `json`, or `silent` |
| `output` | No | — | Path to write scan results (relative to the repository root) |
| `cookies` | No | — | Cookies to include, one per line (`name=value`) |
| `headers` | No | — | Headers to include, one per line (`name: value`) |
| `on_before_script` | No | — | Path to a JavaScript file to run before validations |
| `ignore_response_code` | No | `false` | Run validations regardless of the HTTP response code |
| `debug` | No | `false` | Enable debug mode |

**Config vs. individual inputs:** Use `config` when you want to scan multiple pages — it is the recommended approach. For a single-page scan, skip `config` and set `url` (required) along with any other inputs you need, such as `format`, `output`, `cookie`, or `header`.

## Outputs

| Output | Description |
| --- | --- |
| `outputs` | JSON array of absolute paths to result files written by the scan |

`outputs` is only populated when output paths are configured (via the `output` input or `options.output` in a config file). Validations with `skip: true` are excluded.

```yaml
- uses: Accessible360/audisist-cli-action@v1
  id: scan
  with:
    auth_token: ${{ secrets.AUDISIST_NPM_TOKEN }}
    license: ${{ secrets.AUDISIST_LICENSE }}
    config: .audisist-cli.yml

- run: echo '${{ steps.scan.outputs.outputs }}' | jq -r '.[]'
```

## Usage examples

### Single URL with cookies and headers

```yaml
- uses: Accessible360/audisist-cli-action@v1
  with:
    auth_token: ${{ secrets.AUDISIST_NPM_TOKEN }}
    license: ${{ secrets.AUDISIST_LICENSE }}
    url: https://staging.example.com
    format: json
    output: results.json
    cookies: |
      session=abc123
    headers: |
      Authorization: Bearer ${{ secrets.STAGING_TOKEN }}
      x-custom: value
```

### Config file (multiple URLs)

Create `.audisist-cli.yml` in your repository:

```yaml
validate:
  - url: https://example.com
    options:
      format: json
      output: ./results/home.json
      header:
        - 'Authorization: Bearer token'

  - url: https://example.com/about
    skip: true
    options:
      format: xunit
      output: ./results/about.xml
      cookie:
        - 'name=value'
```

Reference it in your workflow:

```yaml
- uses: Accessible360/audisist-cli-action@v1
  with:
    auth_token: ${{ secrets.AUDISIST_NPM_TOKEN }}
    license: ${{ secrets.AUDISIST_LICENSE }}
    config: .audisist-cli.yml
```

### Inline JSON config

```yaml
- uses: Accessible360/audisist-cli-action@v1
  with:
    auth_token: ${{ secrets.AUDISIST_NPM_TOKEN }}
    license: ${{ secrets.AUDISIST_LICENSE }}
    config: |
      {
        "validate": [
          {
            "url": "https://example.com",
            "options": {
              "format": "json",
              "output": "./results.json"
            }
          }
        ]
      }
```

### Inline JSON config with Cookies and Headers

```yaml
- uses: Accessible360/audisist-cli-action@v1
  with:
    auth_token: ${{ secrets.AUDISIST_NPM_TOKEN }}
    license: ${{ secrets.AUDISIST_LICENSE }}
    config: |
      {
        "validate": [
          {
            "url": "https://example.com",
            "options": {
              "format": "json",
              "output": "./results.json",
              "cookie": ["name=value", "name2=value2"],
              "header": ["Authorization: Bearer token", "x-custom-header: value"]
            }
          }
        ]
      }
```

### Upload results as an artifact

```yaml
- uses: Accessible360/audisist-cli-action@v1
  with:
    auth_token: ${{ secrets.AUDISIST_NPM_TOKEN }}
    license: ${{ secrets.AUDISIST_LICENSE }}
    url: https://example.com
    output: accessibility-results.xml

- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: accessibility-results
    path: accessibility-results.xml
```

### Report xunit results in GitHub

```yaml
- uses: Accessible360/audisist-cli-action@v1
  with:
    auth_token: ${{ secrets.AUDISIST_NPM_TOKEN }}
    license: ${{ secrets.AUDISIST_LICENSE }}
    url: https://example.com
    format: xunit
    output: reports/accessibility-results.xml

- uses: phoenix-actions/test-reporting@v16
  if: always()
  with:
    name: Accessibility Results
    path: reports/*.xml
    reporter: jest-junit
```

## Config file reference

Config files support YAML or JSON. Each entry under `validate` requires a `url`. The `options` object accepts the same options as the CLI `validate` command.

```yaml
validate:
  - url: https://example.com          # required
    skip: false                       # optional, skips this validation when true
    options:
      format: xunit                   # xunit | json | silent
      output: ./results.xml           # optional, writes to file instead of stdout
      cookie:                         # optional
        - 'name=value'
      header:                         # optional
        - 'Authorization: Bearer token'
      onBeforeScript: ./prepare.js    # optional
      ignoreResponseCode: true        # optional
```

## Advanced usage

### On before script

To support advanced use-cases, we allow users to configure an `onBeforeScript` which provides access to the Puppeteer Page prior to running validations.

An example `onBeforeScript.js` could look like:

```js
module.exports = async (page) => {
  // go to the login page
  await page.goto('https://example.com/login');
  // wait until the input fields are rendered
  await page.waitForSelector('#input-email');
  // type the username/password into the inputs
  await page.type('#input-email', 'user@example.com');
  // you can use environment variables to store sensitive data
  await page.type('#input-pass', process.env.USER_PASS);
  // click the submit button
  await page.click('#login-submit');
  // Wait for form submit to complete (which triggers a redirect)
  await page.waitForNavigation();
};
```

You can perform any actions allowed by the [Puppeteer Page](https://pptr.dev/api/puppeteer.page) object

Whatever actions you perform will happen before the page is scanned. An example `config.yml` that uses the onBeforeScript could look like:

```yaml
validate:
  - url: https://example.com/admin/dashboard
    options:
      onBeforeScript: ./onBeforeScript.js

```

To use environment variables in your script, set them on the action step with `env`. They are inherited by the composite action and available to `onBeforeScript` via `process.env`:

```yaml
- uses: Accessible360/audisist-cli-action@v1
  with:
    auth_token: ${{ secrets.AUDISIST_NPM_TOKEN }}
    license: ${{ secrets.AUDISIST_LICENSE }}
    url: https://example.com/admin/dashboard
    on_before_script: ./onBeforeScript.js
  env:
    USER_PASS: ${{ secrets.USER_PASS }}
```
