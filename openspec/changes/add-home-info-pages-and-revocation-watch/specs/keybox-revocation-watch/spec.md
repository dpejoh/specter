# Spec Delta

## Purpose

Detects when the installed keybox has been revoked, reflects that state on the home screen, and, when Auto Keybox is enabled, replaces the revoked keybox automatically.

## ADDED Requirements

### Requirement: Periodic revocation watch

The system SHALL periodically check the installed keybox against the Specter catalog's revocation state on a configurable interval, defaulting to five minutes with a minimum of one minute.

#### Scenario: Installed keybox is revoked

- **WHEN** the catalog reports the installed keybox serial as revoked
- **THEN** the keybox status record is updated with the revoked state, reason, and check time

#### Scenario: Catalog unavailable

- **WHEN** the catalog cannot be fetched
- **THEN** the last known keybox status is preserved and the failure is logged

#### Scenario: Interval changed

- **WHEN** the user sets the revocation watch interval to a value at or above one minute
- **THEN** subsequent scheduler cycles honor that interval

### Requirement: Home reflects revocation immediately on open

The system SHALL perform a fresh installed-keybox check when the Home screen is opened and SHALL show the revoked state without requiring the user to press refresh.

#### Scenario: Home opened after revocation

- **WHEN** the user opens Home and the installed keybox has been revoked since the last snapshot
- **THEN** the keybox card shows the revoked state and the keybox details page exposes the reason and a replacement action

#### Scenario: Background revocation while Home is open

- **WHEN** a scheduled revocation check detects a newly revoked keybox
- **THEN** the card is updated without a page reload

### Requirement: Automatic replacement with Auto Keybox

When Auto Keybox is enabled and a revocation is detected, the system SHALL immediately attempt to install a usable replacement keybox once.

#### Scenario: Auto Keybox enabled

- **WHEN** the installed keybox is detected as revoked and Auto Keybox is enabled
- **THEN** the system fetches and installs a usable keybox, then refreshes the keybox status

#### Scenario: Auto Keybox disabled

- **WHEN** the installed keybox is detected as revoked and Auto Keybox is disabled
- **THEN** the system does not install a replacement and instead presents the revoked state with an install action

#### Scenario: Replacement fails

- **WHEN** no usable replacement can be installed
- **THEN** the revoked state remains visible and the failure is logged without repeating replacement attempts in a tight loop

### Requirement: Revocation metadata in the keybox snapshot

The keybox status snapshot SHALL include the revocation status, reason, last check time, latest catalog version, and keybox file metadata.

#### Scenario: Snapshot consumed by the keybox page

- **WHEN** the keybox details page reads the snapshot
- **THEN** it can display revocation and file information without running an additional shell command
