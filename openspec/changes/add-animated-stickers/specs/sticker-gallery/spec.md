## ADDED Requirements

### Requirement: Published animated sticker synchronization
The system SHALL include local copies of all 181 animated WebM stickers in the two Telegram packs published from OpenSticker on 2026-11-06, preserving published order and source pack metadata.

#### Scenario: Published assets are synchronized
- **WHEN** the published pack manifest is imported
- **THEN** the gallery contains exactly the 120 and 61 published stickers, and each local WebM matches its recorded SHA-256
- **AND** the gallery works without access to the OpenSticker directory

### Requirement: Sticker type switching
The system SHALL provide accessible static and animated sticker selectors with counts, defaulting to static stickers and applying search to the selected type.

#### Scenario: Switch type while searching
- **WHEN** a visitor enters a search term and switches to animated stickers
- **THEN** the search term remains and only matching animated stickers appear
- **AND** an empty state appears when no stickers match

### Requirement: Animated sticker playback and download
The system SHALL preview animated stickers silently in a loop, control playback based on visibility, respect reduced-motion preferences, and offer original WebM downloads and source pack links.

#### Scenario: Download an animated sticker
- **WHEN** a visitor downloads an animated card
- **THEN** the original WebM is downloaded with the correct file extension

#### Scenario: Reduced motion or offscreen card
- **WHEN** reduced motion is requested or an animated card is outside the visible area
- **THEN** the card does not continuously play

### Requirement: Existing static sticker actions
The system SHALL retain the existing static PNG gallery and its copy and download actions.

#### Scenario: Return to static stickers
- **WHEN** a visitor selects static stickers
- **THEN** the existing static stickers remain available with PNG preview, copy, and download
