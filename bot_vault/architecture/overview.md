# Architecture Overview

## Purpose

a browser-based control panel for beamline instruments

## Stack

React 18, TypeScript 5, Vite 7, npm (via conda env `nodejs`). Key dependency: `@diamondlightsource/cs-web-lib` (local tgz) for EPICS / Channel Access. MUI for UI components, Redux Toolkit for state.

## Layout

Single package. Flat `src/` directory with per-deployment configs under `src/deployments/`.

## External dependencies

- EPICS / Channel Access via `@diamondlightsource/cs-web-lib` (local tgz from sister repo `phoebus-web`)

## Open questions

- (fill in as you learn the system)
