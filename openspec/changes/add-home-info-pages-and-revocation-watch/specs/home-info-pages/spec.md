# Spec Delta

## Purpose

Lets users open full-screen, read-only information pages from the two home status cards: one for the installed keybox and one for the device and module setup.

## ADDED Requirements

### Requirement: Home cards open information pages

The two home status cards SHALL be real interactive controls with keyboard access, visible focus, and a clear affordance, and each SHALL open its corresponding full-screen page.

#### Scenario: Keybox card activated

- **WHEN** the user activates the keybox card by pointer, Enter, or Space
- **THEN** the keybox details page opens with a back control

#### Scenario: Setup card activated

- **WHEN** the user activates the setup card by pointer, Enter, or Space
- **THEN** the setup page opens with a back control

#### Scenario: Back navigation

- **WHEN** the user presses the back control, presses the browser/device back gesture, or presses Escape
- **THEN** the page closes and the home screen is restored

#### Scenario: Nested card controls

- **WHEN** the user activates the keybox refresh control or expands clipped card text
- **THEN** the information page does not open

### Requirement: Read-only value rows

The subpage system SHALL provide a grouped, read-only label/value row that supports long values and optional copying.

#### Scenario: Long value rendering

- **WHEN** a value does not fit on one line
- **THEN** the row wraps the value without clipping or breaking the page layout

#### Scenario: Copy action

- **WHEN** a row is marked copyable and the user activates its copy control
- **THEN** the full value is copied and visible feedback confirms the action

### Requirement: Keybox details page

The keybox details page SHALL show the installed keybox's identity, status, certificate expiry, revocation information, and file details.

#### Scenario: Active keybox

- **WHEN** a keybox is installed and not revoked
- **THEN** the page shows the provider, version, type, serial, status, expiry when applicable, last check time, and file path

#### Scenario: Revoked keybox

- **WHEN** the installed keybox is revoked or suspended
- **THEN** the page shows the revocation state and reason and offers an action to install a different keybox

#### Scenario: No keybox installed

- **WHEN** no keybox is installed
- **THEN** the page shows an explanatory empty state and an install action

#### Scenario: Refresh

- **WHEN** the user activates refresh
- **THEN** the page runs a fresh keybox status check and re-renders the values

### Requirement: Setup page

The setup page SHALL show a redacted snapshot of the device, keystore backend, installed module configuration summaries, and Specter feature states.

#### Scenario: Configured device

- **WHEN** the setup page opens
- **THEN** it shows device identity, Specter version, the effective security patch, keystore backend state and target count, detected modules with selected configuration values, and enabled feature states

#### Scenario: Missing optional module

- **WHEN** Play Integrity Fix, HMA-OSS, or another optional module is not installed
- **THEN** its section and related feature rows are omitted, matching the Tools page

#### Scenario: Missing keystore backend

- **WHEN** no supported keystore backend is installed
- **THEN** the page shows a clear "not installed" state without failing the rest of the page

#### Scenario: Secrets are excluded

- **WHEN** the setup snapshot is generated
- **THEN** it does not contain keybox content, OMK crypto seeds, IMEI, MEID, or device serial values

#### Scenario: Cached snapshot on open

- **WHEN** the page opens and a cached snapshot exists
- **THEN** the page renders it without starting a shell process

#### Scenario: Inputs change in the background

- **WHEN** a module config, Specter setting, target list, PIF prop, or HMA config changes
- **THEN** the scheduler daemon rebuilds the snapshot once and leaves the page cache fresh

#### Scenario: Refresh

- **WHEN** the user activates refresh on the setup page
- **THEN** the system regenerates the snapshot and re-renders the values

### Requirement: Information page localization

New page titles, row labels, states, and actions SHALL be available through the existing translation system.

#### Scenario: Non-English locale

- **WHEN** the user selects a supported non-English language
- **THEN** the two new pages display translated labels where translations exist and fall back to English otherwise
