# Reporting security issues

Send a minimal reproduction and the affected build identifier to
lonex.chat@gmail.com. Do not include real passwords, private keys, personal
files or another user's information. Avoid posting unpatched exploit details
in a public issue. This is a reporting contact, not a promised response SLA.

Lone X is a Beta. It is not a sandbox for untrusted projects. Approved npm
scripts run with the signed-in Windows user's permissions. Agent path checks
and per-action review reduce risk but do not protect against a compromised
Windows account or a hostile local process racing filesystem operations.

Chats and project files are not encrypted by Lone X. Protected sign-in sessions
and legal receipts use Windows protected storage; this does not isolate them
from every process running as the same Windows user. Use Windows device
encryption and a separate Windows account when appropriate.

Maintain a supported Electron version, review upstream advisories as well as
`npm audit`, retain component notices and verify release checksums. An audit
does not certify that no vulnerabilities or past breaches exist.
