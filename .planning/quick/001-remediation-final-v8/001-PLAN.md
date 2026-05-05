---
task: 001
name: remediation-final-v8
description: Remediation_Final_V8 - Technical debt and lint fixes
---

# Quick Task 001: Remediation_Final_V8

## Objective
Apply critical lint and architecture remediations as per WEB-LINT-REMED-001-REV1 to ensure codebase integrity and compliance with v8.0.0 standards.

## Tasks

<task type="auto">
  <name>Refactor ConfigModal Hoisting</name>
  <files>src/components/admin/ConfigModal.tsx</files>
  <action>Move getDefaults function outside of the component or before useEffect to ensure proper hoisting and prevent unnecessary re-renders.</action>
  <verify>npm run lint</verify>
  <done>getDefaults is defined before useEffect and the component remains functional.</done>
</task>

<task type="auto">
  <name>Harden firebase-admin.ts types</name>
  <files>src/lib/firebase-admin.ts</files>
  <action>Add @ts-expect-error to eval calls to handle dynamic requires in ESM environment without using @ts-ignore.</action>
  <verify>npm run lint</verify>
  <done>@ts-expect-error is used instead of any @ts-ignore on eval lines.</done>
</task>

<task type="auto">
  <name>Verify Image optimization in ProspectModal</name>
  <files>src/components/admin/ProspectModal.tsx</files>
  <action>Ensure all images use next/image with unoptimized={true}.</action>
  <verify>grep -c "unoptimized={true}" src/components/admin/ProspectModal.tsx</verify>
  <done>Images are correctly optimized/configured.</done>
</task>

---
*Created: 2026-05-04*
