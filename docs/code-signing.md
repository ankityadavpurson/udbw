---
title: Code signing policy
description: How Universal DB Workbench installers are built and signed.
---

## Status

Installers are **currently unsigned**. The project is applying for free code signing for open-source projects from SignPath Foundation. Until that is approved, Windows shows "Unknown publisher" for the installer.

Once signing is enabled, this page will state:

> Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).

## How builds are produced

Installers are built from the source code in this repository by the GitHub Actions workflow `.github/workflows/ci.yml`, never from a developer's machine. A release is created only from a commit on `main` that passed lint, unit tests and the UI smoke test.

## Team roles

The project currently has a single maintainer, who holds all roles:

| Role | Who |
| --- | --- |
| Author (changes the source) | [Ankit Yadav](https://github.com/ankityadavpurson) |
| Reviewer (reviews contributions from others) | [Ankit Yadav](https://github.com/ankityadavpurson) |
| Approver (approves each signing request) | [Ankit Yadav](https://github.com/ankityadavpurson) |

Contributions from other people are accepted through pull requests and reviewed by the maintainer before merging. Every person with access to the repository or to the signing service is required to use multi-factor authentication.

## Privacy

See the [privacy policy]({{ '/privacy/' | relative_url }}).
