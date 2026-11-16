# Clean Windows acceptance test — pending

## Current limitation

VirtualBox 7.2.10 is installed, but its only registered VM is Kali Linux.
The founder confirmed that no Windows ISO or clean Windows VM is available.
The host is Windows Home Single Language; Windows Sandbox is unavailable.
A full application/integration test passed on the host, but that does not close
the clean-Windows milestone.

## Obtain an installation image

Use the official [Microsoft Windows 11 Enterprise evaluation page](https://www.microsoft.com/en-us/evalcenter/evaluate-windows-11-enterprise).
Microsoft describes a 90-day evaluation and requires registration. Complete the
registration yourself; no personal or company details have been submitted by
this agent. Review the evaluation terms and account requirements. Download the
Windows x64 ISO to `E:\Lone-X-TestLab\Downloads` and verify its SHA-256 against
Microsoft's official value for that exact language/release. Do not install it
onto the host drive or repartition the PC.

## VM configuration

Create a separate VirtualBox VM with its machine folder and dynamically allocated
virtual disk in `E:\Lone-X-TestLab\VMs`. Use Windows 11 x64, EFI/TPM 2.0 where
required, 2 virtual CPUs, 4–6 GB RAM on this 16 GB host and a 64 GB virtual disk.
Keep sufficient E: free space as the virtual disk grows. Use NAT only for initial
Windows setup; no bridged network, port forwarding, shared clipboard, drag/drop
or writable host shared folders. Preserve the existing Kali VM unchanged.
Guest Windows may call its virtual system disk C:, but that VDI is physically
stored on E:; the host's C: must not hold the ISO, VDI or large download caches.
Take a clean snapshot before installing Node, Git, standalone Ollama or Lone X.

## Test matrix and evidence

Record the Windows build, ZIP SHA-256, Lone X build revision, installed tools,
Defender state and results/screenshots in `E:\Lone-X-TestLab\Evidence`.

1. Transfer a verified candidate ZIP using a read-only ISO or temporary download;
   detach any host transfer media before testing agent/installer actions.
2. Disconnect guest networking. Extract the complete ZIP. Launch Lone X without
   Node.js, Git or standalone Ollama installed. Confirm logo in Explorer, window,
   taskbar and generated shortcut; app starts maximized without a console.
3. Verify all three legal documents are readable, boxes initially unchecked,
   partial acceptance cannot proceed, and full versioned acceptance unlocks
   local account creation. Restart; acceptance and three-day session persist.
4. Send an offline default-model chat. Confirm bundled runtime/model startup,
   usable output, Stop, history reload/delete, and no requirement for an API key.
5. Reconnect NAT. Download one optional model and test it, then disconnect again
   and verify local chat. Model download failure/cancel must leave the UI usable.
6. Agent: download Qwen3 Instruct if required. In a disposable guest folder,
   create/edit/recycle fixture text; reject an edit and verify no change; inspect
   backups. Verify traversal, links, credential paths and protected writes fail.
   PC-wide access requires native confirmation and Disconnect revokes access.
7. From the clean snapshot, install Node.js LTS, Git and 7-Zip through the app
   one at a time. Record WinGet source/license/publisher prompts and Windows
   elevation screens. Verify actual installed binaries and logged outcomes;
   cancel one install and verify no false success. This is the outstanding real
   installer check; a mocked test is not sufficient.
8. Test project preview, reviewed edits/npm tasks, fixed terminal commands,
   browser isolation and selected-file Recycle Bin confirmation with fixtures.
9. Test update availability and a verified newer ZIP using two real release
   revisions; verify current build says up to date and a corrupt fixture download
   fails. Keep manual extraction/update instructions accurate.
10. Run uninstall from terminal and from its script on disposable app copies.
    Confirm exact targets, default profile retention, explicit profile deletion,
    preservation of unrelated files and refusal of linked/unsafe targets.
11. Restore the clean snapshot before each alternative install/uninstall path.
    Retain failures and logs, not just successful screenshots.

No row is marked passed until executed in the clean guest. Run Windows 10 x64
separately if that platform remains advertised; a Windows 11 result alone does
not validate every supported Windows version or physical GPU configuration.
