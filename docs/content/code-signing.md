## Status

Free code signing will be provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org), once our application is approved.

Until then, installers are **unsigned** and Windows shows "Unknown publisher". When signing is switched on, the publisher shown on signed installers will be "SignPath Foundation", and this page will be updated to say so.

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

See the [privacy policy](/privacy/).
