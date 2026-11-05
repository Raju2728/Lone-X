# Development progress

## Beta publication — 5 November 2026

The founder authorized publication of the current code and replacement Windows ZIP. This supersedes the earlier release hold. The build remains Lone X (Beta); unfinished milestone acceptance checks, including clean-Windows software installation, remain open. The release retains the stable Lone-X-Windows.zip filename and includes the setup guide, uninstall scripts, selected-folder Chat agent, on-demand Qwen3 4B Instruct, storage review and fading responses.

## Milestone 1 — In progress

The responsive landing page and Electron renderer share the supplied Lone X logo and light and dark theme tokens. The landing page uses Glare Hover from React Bits. The desktop shell provides overview, workspace draft, projects status, task status, terminal status, activity, and appearance settings. Draft and theme preferences use browser storage in this milestone.

TypeScript checking and the Vite production build passed. Headless Edge verified landing page rendering, the React Bits component, theme switching and persistence, workspace anchor navigation, and layout at 360 pixels. The build emits warnings about Framer Motion client directives that Vite ignores.

The Windows Electron smoke test passed for launch, all seven navigation targets, theme switching and persistence, and renderer isolation. Full visual and keyboard accessibility review remains pending. Provider chat, task execution, terminal commands, SQLite persistence, and cloud integration belong to later milestones.

## Milestone 2 — Local AI verified

The approved scope uses Ollama exclusively. Live streaming passed with qwen2.5:0.5b. The Windows smoke test passed for model discovery, chat streaming, retry, and SQLite storage.

## Milestone 3 — In progress

Projects can list the immediate entries of a folder selected in the Windows folder picker. The renderer supplies no filesystem path, and the handler checks the caller before opening the picker. The smoke test verifies cancellation and approved folder listing. File reads and writes, PowerShell execution, audit logging, and emergency stop are pending.

The project browser can preview an explicitly selected UTF-8 text file up to 128 KB. Thought Line shows waiting and streaming status in the local chat.

Users can save the preview bytes to a new file selected in the Windows save dialog. The desktop smoke test verifies the copy and refusal to overwrite an existing file.

Settings > Terminal now runs two fixed, read-only PowerShell diagnostics after a native Run once approval. Local SQLite records the command label and outcome. Stop cancels a pending approval or terminates the current PowerShell process. Arbitrary commands and autonomous execution are outside this increment.

Milestone 3 checks passed for approved file operations, the fixed PowerShell command list, native approval and denial, SQLite audit history, and stopping a real PowerShell process before launch and during execution. The running-stop test uses a harmless sleep command in an isolated profile.

## Milestone 4 — In progress

Settings > Task monitor drafts a local Ollama plan with up to eight ordered steps and a verification check for each step. The renderer displays validated text for review. Drafting does not grant permissions or execute tools. The Windows smoke test checks structured plan parsing and rejection of malformed replies. A live qwen2.5:0.5b planning request also passed.

The fixed read-only PowerShell commands now run directly from the console. The allowlist, local audit, and emergency stop still apply.

The task planner can attach an approved read-only diagnostic to a proposed step. Users confirm the exact diagnostic before running it, see its result beside the step, and can stop it. Execution uses the existing terminal allowlist and SQLite audit log.

Projects can create a static HTML starter in a new subfolder after the user selects its parent. The starter contains an HTML page, stylesheet, and README. The smoke test verifies the generated files in an isolated profile.

Projects can edit a previewed UTF-8 source file and save the result to a new path selected through the Windows save dialog. The original stays available for comparison. The smoke test checks the edited bytes, original file, and overwrite protection.

The generated HTML starter can run in a sandboxed desktop preview without dependencies. The starter workflow reports passed, missing, and changed files. Users can restore missing template files through an explicit action. Changed files require review and are preserved. The smoke test removes a stylesheet, observes the failed check, restores the file, and opens the preview.

Changed starter files can be compared with the original template and saved as repaired copies at a new path. The smoke test verifies the template bytes and preserves the changed original.

After reviewing a changed starter file, users can confirm an in-place template restoration. Lone X checks that the file still matches the reviewed bytes and saves the original in a backup folder before replacing it. The desktop smoke test verifies cancellation, rejection of stale reviews, and backup contents.

Projects can inspect a selected npm project, review its exact start or test command, and approve execution. Lockfile-based dependency installation uses npm ci with lifecycle scripts disabled. Commands show live output and exit status, and can be stopped. The workflow uses a standard Windows Node.js installation.

Projects can send the latest failed npm test output and one explicitly previewed source file to local Ollama. A proposed edit must match one exact location in that file. Users review the diagnosis and the proposed text before approving an edit with a backup. Tests are rerun through the existing approval flow.

The desktop smoke test installs a local dependency, runs the fixture, detects a failing test, applies a simulated Ollama proposal with a backup, and reruns the test successfully. Live checks with the installed small models diagnosed the fixture failure but did not produce an acceptable edit. Live fix generation remains open. The workflow is scoped to npm projects and one source file per proposal.

## Milestone 5 — Deferred

Live cloud setup and deployment are paused at R2 activation. Cloudflare requires a billing-enabled subscription. The locally verified implementation is available if cloud work resumes.

The resource API uses MongoDB Atlas for version metadata and a private Cloudflare R2 bucket for binaries. Administrators register an uploaded object after the API checks its size and SHA-256. Readers can list metadata and download a specific version. Downloads are pinned to the object's registered ETag. Local tests use simulated Atlas and R2 adapters.

Settings → Resources lists registered versions. The desktop process keeps the reader token out of the renderer, rejects redirects, and checks each download's size and SHA-256 before saving it. The desktop smoke test covers authenticated catalog access and rejects corrupt bytes without leaving a partial download. Live Atlas and R2 verification and deployment remain open.

The desktop smoke test now registers and downloads a resource over real loopback HTTP using the backend routes with simulated storage. A read-only live smoke check can verify a registered Atlas and R2 resource once the service and reader credentials are configured.

Administrators can withdraw a version from the catalog and block new downloads while retaining its metadata and R2 object. Local tests verify reader denial, repeat requests, and continued access to other versions.

## Milestone 6 — In progress

Settings → Local models lists supported Ollama models, their installation status, and their reported size. Users can download a missing model, follow per-file progress, and cancel the transfer. A download completes only after Ollama reports success and the model appears in its inventory. The desktop smoke test covers the download and installed state with simulated Ollama responses.

Settings → Software checks the standard Windows locations for Node.js and Git, shows a WinGet installation plan for missing tools, and asks for confirmation before launching the publisher installer. Afterward it checks the installed tool's version. WinGet retains its installer hash check and package/source agreement handling. The desktop smoke test simulates WinGet and verifies package selection, cancellation, approval, and post-installation detection.

Installation attempts are recorded locally in SQLite. An unfinished attempt from an exited process is marked for verification on the next launch. Installers are checked again before a retry. The tests simulate interruption and retry, confirm approval cancellation, and verify the recorded outcome.

The model manager reuses installed models without pulling them again. Tests cover cancellation, interrupted transfers, and a success response whose model is missing from the local inventory.

Live installation on a clean Windows profile remains unverified. The founder has no VM or spare Windows PC available, and Windows Sandbox is absent on the current PC. The build and simulated desktop checks passed. Beta publication has now been authorized; the clean-Windows check remains open.

## Milestone 7 — In progress

Settings → Automation shows local memory and processor counts and offers approved launch requests for Notepad, Calculator, and Paint when their standard Windows executables are available. The main process restricts the app IDs and asks for confirmation. Pending approval can be cancelled, and local SQLite records the outcome. Windows handles the application after the launch request.

The desktop smoke test verifies approval, cancellation before launch, error reporting, and audit history with a simulated Windows launch.

The browser workspace opens an approved HTTPS origin in a sandboxed window and a separate temporary session. It blocks cross-origin navigation, popups, downloads, and permission requests. Users can stop loading or close the workspace. Further browser workflows and application interactions remain open.

Desktop checks use local page fixtures to verify same-origin navigation, blocked external links and popups, cancellation, HTTP errors, and lack of access to Lone X's preload APIs. The local Privacy Policy draft is version 1.1, with consent revision 2 for the additional optional browser and audit disclosures.

The browser workspace now provides Back, Forward and Reload. The main process accepts only these fixed actions and checks each destination against the approved HTTPS origin, including history entries. Controls reflect available history, and Stop remains available while loading. Same-page navigation updates the displayed URL; browser process failure is reported. Desktop checks cover back/forward navigation, reload, unavailable history and invalid actions. Broader application interactions and final release quality assurance remain outstanding.

Settings → Storage & files scans a user-selected folder, reports its drive capacity/free space, and lists the 30 largest files from up to 5,000 entries. Links and inaccessible entries are skipped and partial scans are labeled. The user can stop scanning. Removal is limited to individually reviewed regular files, requires native confirmation, checks for changed paths/contents metadata, and uses Windows Recycle Bin. System directories and Lone X application/profile files are protected. Projects provides the existing selected-file read/edit workflow. Software now includes 7-Zip alongside Node.js LTS and Git through WinGet. Real clean-system installations remain unverified.

The portable Windows package includes Uninstall-LoneX.cmd and Uninstall-LoneX.ps1. Uninstall validates the package folder, refuses reparse points, confirms the exact targets, stops only processes from that extracted folder, and removes that app copy and bundled models. Local profiles are retained unless -RemoveUserData is explicitly used. Standalone Ollama and external projects/tools are kept. Temporary-folder tests verify preview, invalid package rejection, link rejection, default retention and explicit profile deletion. Privacy Policy 1.2 and consent revision 3 disclose the storage tools.

The production renderer build, desktop storage checks and temporary-folder uninstall tests passed. The local Lone-X-Windows.zip was rebuilt with the bundled runtime/model, setup instructions and both uninstall scripts; archive entries were hash-checked against source. This local build omits a published revision marker while source changes are uncommitted. GitHub release replacement has now been authorized.

The terminal recognizes LoneX -uninstall and opens only the uninstaller beside the packaged executable. Windows shows the uninstall confirmation in a separate PowerShell window. Development builds refuse this command, and launching the script does not claim removal has finished. The workspace opens maximized, with normal Windows restore/minimize controls available.

Chat now has an optional selected-folder Agent mode with Qwen3 4B Instruct. The model manager supports on-demand model installation with existing progress/cancellation and cache reuse. The agent loop inspects folders and text files, proposes file creation/edits/recycling for explicit review, and requests reviewed npm dependency installs or tests. Existing files are checked against read snapshots, edits/recycling retain backups, and common credential paths and links are rejected. Folder access can be disconnected. Each provider request shares the five-hour/weekly token budget; interrupted turns retain action receipts. The loop is bounded to eight model rounds and 16 tool actions. Text files are limited to 16 KB. Privacy Policy 1.3 and consent revision 4 disclose these features.

Agent unit checks verify path restrictions, review denial, backups, stale-content handling (including changes during review), recycling, command review, tool dispatch, cancellation and token accounting. The desktop fixture verifies Qwen3 Instruct download, rendered before/after review and approved file creation through Chat IPC. A live Qwen3 4B Instruct task created an approved hello.txt, read it back and verified the exact content, consuming 2,204 reported tokens. The general Qwen3 4B tag had spent its response budget reasoning, so the agent uses the official Instruct variant instead. Ten unit checks and the full desktop smoke suite passed. The local ZIP was rebuilt and its agent, IPC, legal, renderer index, guide and uninstall files hash-checked against source. Optional model weights remain on-demand downloads rather than ZIP or Git contents. No claim of Codex-equivalent model capability is made. Public Beta release replacement has now been authorized.

Assistant responses now reveal incoming words in short batches with a soft opacity fade. Completed text is flushed without replaying earlier chunks; saved history stays static. Reduced-motion preferences disable the animation, and follow-latest scrolling also updates when a batch is revealed.

Desktop-targeted file prompts now request access to the actual Windows Desktop, select Qwen3 Instruct and enable Agent mode. If the model is missing, the prompt stays available while the user downloads it. A Use Desktop shortcut provides the same access flow. File changes still require separate before/after approval. The agent also has an explicit create-directory tool for empty folders.

The exact prompt "Create A New text file in Desktop and write Welcome to LoneX in it" passed the rendered Chat test with a temporary Desktop, native access approval and file-change review. A live Qwen3 Instruct run created Welcome.txt containing Welcome to LoneX in an isolated Desktop fixture (1,750 reported tokens). Desktop-prefixed tool paths resolve to the approved Desktop root; traversal paths remain rejected. The tests do not create files on the founder's real Desktop.

PC-wide access now provides a separately confirmed session scope across Windows drives, with drive discovery, absolute paths, known-folder aliases and per-change approval. Backups are stored beside edited files. Protected system/application writes, credential paths, links and UNC/device paths stay blocked. Disconnect revokes the scope. Unit tests cover absolute-path creation, edits, backups, recycling, declined requests and protected files outside the initial folder. The desktop UI test verifies scope denial/approval, full destination review, outside-home file creation and revocation. Privacy Policy 1.4 and consent revision 5 describe this scope.

A live Qwen3 Instruct PC-wide task created PCWelcome.txt at an absolute E: path outside its initial Home fixture, with exact content verified on disk (2,343 reported tokens). The test only authorized changes inside its temporary fixture. PC-wide access changes the file-tool scope, not Windows privileges; approved npm scripts retain the broader execution rights described in their command review.

The Windows packager now embeds a seven-size Lone X logo icon in the executable and includes Lone-X.ico for shortcuts, with the same ICO used for the app window and a stable Windows app identity. The build-only resedit library updates executable resources; tests verify the exact image bytes in every icon resource and launch a sandboxed renderer from the branded executable with its packaged runtime layout.

Regular Chat and Agent prompts share Thanglish guidance with per-turn language preference, preservation of quoted values/paths/code and an explicit English override. Thanglish Desktop commands use the same native scope and change-review flow. A live Qwen3 Instruct request created WelcomeThanglish.txt with exact Vanakkam LoneX content and a Thanglish response (2,495 tokens). Smaller models may have weaker language quality. Pre-tool model narration is withheld so it cannot announce success before the tool outcome is known.

Thanglish is shared across all four Chat models: Qwen2.5 0.5B, Qwen2.5 Coder 0.5B, Gemma 3 1B and Qwen3 4B Instruct. Model descriptions and the Windows guide now state this explicitly. Desktop integration checks verify each model's regular Chat request receives the same Thanglish response guidance. This confirms application routing; language quality still depends on the selected model.

Verification on 5 November 2026: the production renderer build, full Windows desktop smoke suite, five token-window tests and resource API test passed. The browser tests use isolated local HTTPS fixtures; resource tests use simulated storage. Source publication follows the Continue Next workflow. The founder subsequently authorized publishing this Beta while a real clean-Windows software installation test remains outstanding.

## Local AI usage windows

Lone X defaults to 100,000 input/output tokens per five hours and 1,000,000 per seven days, shared across models and local accounts on the same installation. These product defaults are not OpenAI subscription limits. Each independent window starts with its first admitted request; expired windows clear on the next status check or request, including after app restart. SQLite stores the counters and reset timestamps separately from lifetime chat metrics and chat retention. Deleting a chat does not clear the counters.

Chat, automatic titles, plans and repair suggestions all pass through the main-process limiter. A request already admitted can finish over a limit; the next request is blocked until both windows have remaining capacity. Ollama completion counters supply input/output usage, including history and attachments. Interrupted streams and missing counters use a conservative UTF-8 byte estimate. Network and HTTP failures before streaming do not consume tokens. The sidebar Limits option opens remaining allowance bars and reset timestamps: five-hour above weekly, green at 70–100%, orange at 40–below 70%, yellow at 10–below 40%, and red below 10%. Its circular icon uses the upper arc for five-hour and lower arc for weekly. The scope is local usage management, not tamper-resistant cloud billing.

`node --test tests/token-limits.cjs` verifies persistence, independent resets at exact boundaries, exhausted-window enforcement, late completions, interrupted responses and missing counters. Beta publication has been authorized; the unfinished milestones remain tracked separately.
## 5 November 2026: packaged Beta, policies and icon follow-up

Website feature cards now reflect the reviewed PC-wide/file agent, four local models and Thanglish guidance, project/npm and WinGet tools, storage, browser/app tools, local history, usage windows, and portable update/uninstall workflows. The download panel includes RAM recommendations and extra model storage guidance. Mac remains coming soon; no hosted AI API or active cloud-resource service is advertised.

Terms 1.1, Privacy 1.5 and EULA 1.1 (updated 2026-11-05, consent revision 6) disclose session-only access, action approval, npm scripts running with Windows permissions, backup retention independent of chat retention, activity-based 30-day pruning, local model storage and portable uninstall choices. All three documents now have dedicated website routes. Legal receipts must match every current document version as well as the revision.

Windows Shell extraction of the previously published executable returned the actual Lone X logo. The new window uses the PNG for its runtime icon and explicit Windows taskbar/relaunch details referencing the ICO. The ZIP includes a dynamic Create-Desktop-Shortcut.cmd/.ps1 helper that points to the actual extraction folder, assigns Lone-X.ico, and asks before overwriting an existing shortcut. Existing pinned icons may need unpinning and repinning; old extracted copies are not silently replaced. Setup instructions cover this.

Production build, full desktop integration and branded-executable/uninstaller checks passed before publication. A real clean-Windows software install remains unverified; this release remains Beta. Publication evidence is reported with the release.
