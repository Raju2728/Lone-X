# Technical legal review — 5 November 2026

This is an implementation/licensing review, not a lawyer's opinion, legal
certification or a promise that every jurisdiction's requirements are met.
Open-source publication does not automatically require hiring a lawyer. A
qualified review is an optional risk-management decision, especially before
charging users, serving organisations or minors, or adding cloud processing.

## Confirmed operator and license decision

The founder identified the operator as **Rajesh .T**, known as Raju, based in
**Coimbatore, Tamil Nadu, India**, contact **lonex.chat@gmail.com**. These details
are reflected in the working-copy policies. No company registration, street
address, DPO appointment or legal certification has been invented.

The founder selected MIT for original code. Added LICENSE and package metadata,
and removed proprietary redistribution/reverse-engineering/termination wording
that conflicted with that grant. Terms 1.2, Privacy 1.6 and EULA 2.0 use consent
revision 7. The EULA explicitly preserves MIT rights independently of first-run
acknowledgment and hosted-service restrictions. Required notices are generated
for production npm packages and included in the website/package build.

## Material third-party exception

The checked React Bits license is **MIT plus Commons Clause**, not unrestricted
MIT. Preserve public/react-bits-LICENSE.md and distribution notices. Its text
permits use in an application and restricts redistributing the components/tools
as such. Do not describe every included component as unrestricted open source
or strip the restriction when publishing original Lone X code under MIT.
If the objective is a distribution consisting solely of OSI-approved licenses,
replace those components with original or appropriately licensed alternatives,
or obtain different rights from their author. This review has not obtained
additional permissions or reinterpreted the license as MIT-only.

Electron/Chromium, Ollama, icons and model weights keep their own licenses.
The bundled default model's license is copied by packaging. Optional model
licenses differ; review them before redistributing weights. MIT for Lone X does
not itself grant trademark endorsement or rights to third-party model output.

## Functionality and privacy alignment

Policies describe local SQLite account/chat processing; salted password hashes;
protected session/consent receipts; session-only agent scope and separate action
review; plaintext chat/project data; scripts running with Windows user rights;
Windows speech recognition; optional configured SMTP; local model downloads;
GitHub/Vercel request information; inactive optional cloud resources; and
portable update/uninstall behavior. Backup retention is separate from activity-
based chat pruning. No hosted OpenAI/Google model processing is claimed.

Website/footer and app Settings expose the documents. Initially unchecked
acceptance is enforced before account/app features. Receipts store UTC time,
revision and exact document versions, and stale versions trigger renewed review.
Privacy acknowledgment is notice, not blanket approval for optional processing.

Indian DPDP commencement is phased. The policy refers to provisions as they take
effect, preserves mandatory consumer/privacy remedies, and avoids claiming
unqualified worldwide compliance. No arbitrary exclusive court or mandatory
arbitration venue has been invented.

## Founder actions still needed

- Monitor the published grievance/support mailbox and establish an actual
  request, identity-verification, correction/deletion and incident-response
  process. A policy alone does not perform these operations.
- Confirm ownership/contributor permissions for original code/assets. Retain
  third-party notices for each release and check any model license changes.
- Confirm hosting log/retention settings and each configured mail provider's
  actual processing. No access to provider administration/audit logs was used.
- Do not add telemetry, cloud prompts, marketing or new account processing
  without checking the notice and user controls first.
- Revisit age-targeting, commercial distribution and international obligations
  if the product's audience or business model changes. Mandatory law cannot be
  waived by a disclaimer. Seek qualified advice if the risk warrants it.

## References checked

- [MIT text, Open Source Initiative](https://opensource.org/license/mit)
- [React Bits license](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md)
- [MeitY DPDP Rules 2025 and commencement](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)
- [India Code: IT Act](https://www.indiacode.nic.in/bitstream/123456789/13116/1/it_act_2000_updated.pdf)

These updates are local, not yet the published policies. The existing public
release remains subject to its supplied notices and any prior grants; this
review does not silently rewrite historical releases.
