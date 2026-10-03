# TM50 Customer Requirements — Clean Baseline

**Source:** TM50 Motor Montaj Hattı Üretim İzleme ve İzlenebilirlik Yazılımı — Kullanıcı İster Dokümanı (URS / Software Requirement Specification), Sürüm 1.0, 17.09.2026

## Purpose

This file is a cleaned baseline of the customer's URS.

It is intended to preserve the customer's stated functional scope while:

- merging repeated requirements,
- avoiding duplicate acceptance criteria,
- separating optional / proposed / unresolved items from mandatory scope,
- avoiding assumptions that are not supported by the URS,
- keeping this file independent from the HTML prototype and from implementation decisions.

This is **not** yet the final project scope or implementation backlog.

---

# 1. General System and Users

- **R-001 [High]** The application shall be a web application that runs in modern browsers without requiring additional client installation.
- **R-002 [High]** Station, motor, alarm and production data shall be updated in real time or near-real time. The target update latency under normal conditions is 1–3 seconds.
- **R-003 [High]** The main control screen shall be able to show line flow, KPIs, selected-station details, rework and recent events on the same page.
- **R-004 [Medium]** The UI shall prioritize 1920×1080 and higher resolutions while remaining usable at lower desktop resolutions.
- **R-005 [High]** The system shall support role-based access control (RBAC), with separate permissions for Technician, Production Leader / Supervisor, Quality, Maintenance / Automation and Admin roles.
- **R-006** A Technician shall be able to perform authorized actions such as viewing station/operation information, adding notes, opening Andon calls, requesting material/quality support, placing HOLD and completing operations.
- **R-007** A Supervisor shall be able to view the line, review station performance, acknowledge/assign/close alarms and track rework.
- **R-008** A Quality user shall be able to access OP100 quality results, nonconformities, motor images, rework records and re-inspection records.
- **R-009** A Maintenance / Automation user shall be able to access PLC/equipment status, sensor/IO information, alarms and integration-health information.
- **R-010** An Admin shall be able to manage station master data, users/roles, routing, alarm rules, integration settings and data-retention settings.

---

# 2. Main Assembly Line

- **R-011** The system shall contain the following 13 main operations with the operation names defined in the URS:
  - OP005
  - OP010
  - OP015
  - OP020
  - OP030
  - OP040
  - OP050
  - OP060
  - OP070
  - OP080
  - OP090
  - OP100
  - OP110
- **R-012 [High]** The main line shall be visualized horizontally / isometrically. Each station shall show active motor, status, technician/automation type and operation information.
- **R-013 [High]** Motors on the line shall be represented with a TM50-like readable motor illustration and motor serial number.
- **R-014 [High]** Clicking a station shall not automatically navigate the user to another page. The selected-station panel, cycle graph and related details on the same screen shall update for the selected station.
- **R-015 [High]** Running/Normal, Warning/Takt Risk, Fault/NOK and Offline states shall be visually distinguishable.

---

# 3. Subassembly

- **R-016** The system shall contain the following subassembly operations with the operation names defined in the URS:
  - OP201
  - OP202
  - OP203
  - OP205
  - OP206
- **R-017 [High]** Subassembly stations shall be shown as independent work cells/tables separate from the main conveyor.
- **R-018 [High]** Each subassembly cell shall track daily production, hourly rate, buffer stock, target and status.
- **R-019 [High]** The system shall show which main-line operation each subassembly feeds.
- **R-020 [High]** A warning shall be generated when buffer quantity falls below the configured minimum level.

---

# 4. Selected Station Detail

- **R-021 [High]** The selected station shall show active motor, technician/automation type, cycle/target, takt deviation, remaining time, next station and operation progress.
- **R-022 [High]** Process detail shall be able to show recipe, PLC/Cell ID, equipment/tool, Pset/program, checklist and critical component/lot information.
- **R-023 [High]** Quality/tightening detail shall show quality result, Andon, latest alarm and, where applicable, torque target/actual/angle/result.
- **R-024 [High]** PLC connection, tool status, heartbeat, sensor/IO states and basic maintenance metrics shall be displayable.
- **R-025 [High]** Information/warning/error type notes shall be addable to a station. Author, timestamp and related alarm/topic shall be stored.
- **R-026 [High]** Station history shall list motor serial number, technician, cycle, result and related note/alarm.

---

# 5. Motor Tracking and Traceability

- **R-027 [High]** A user shall be able to search by motor serial number and access the motor's current state and as-built history.
- **R-028 [High]** The following serialized components shall be associated with the motor using unique serial numbers:
  - Throttle Set
  - Motor Block
  - Crankshaft
  - Piston Cylinder Set
  - Cable
  - Alternator
  - Starter Motor
- **R-029 [High]** If the related operation has not yet been completed, the component shall be shown as `Pending / Not Yet Installed`; after completion it shall be shown as `Installed` with its serial number.
- **R-030 [High]** Motor completion percentage shall be calculated over the 13 main operations and shown as a percentage/progress bar.
- **R-031 [High]** For every operation completed by a motor, the system shall retain entry time, exit time, cycle, technician, installed part/serial number and quality result.
- **R-032 [Medium]** Images captured at the OP100 quality station shall be associable with the motor serial number.

---

# 6. Quality and Rework

- **R-033 [High]** OP100 quality result shall be stored as OK/NOK/HOLD and shall be able to affect the motor's subsequent routing decision.
- **R-034 [High]** NOK/HOLD motors shall enter a rework queue containing fault type, source operation, root cause, priority, responsible party and rework operator.
- **R-035 [High]** The rework process shall support a state flow similar to Triage → Diagnosis → Rework Bench → Ready for Re-QC.
- **R-036 [High]** A motor that has completed rework shall be able to be routed back to OP100 quality control.

---

# 7. Alarm and Andon

- **R-037 [High]** The alarm list shall be filterable by severity, status, source, operation and search criteria.
- **R-038 [High]** Alarm lifecycle shall support Detected → Acknowledged → Assigned → Closed.
- **R-039 [High]** An alarm shall be assignable to a team or user. Assignment and closure actions shall be written to the audit trail.
- **R-040 [High]** A technician shall be able to create an Andon call for material, quality or production support.
- **R-041 [High]** The user shall be able to navigate from an alarm detail to the related motor's traceability view.

---

# 8. Tightening / Torque

- **R-042 [High]** Tightening records shall retain timestamp, motor serial number, operation, tool/controller, Pset, joint, target torque, actual torque, angle and OK/NOK result.
- **R-043 [High]** Online/available status of tightening controllers and tools shall be displayable.
- **R-044 [Medium]** Tightening records shall be exportable in a CSV/Excel-like format.

---

# 9. KPI and Reporting

- **R-045 [High]** The system shall display Availability, Performance, Quality/FPY, OEE, output/hour, plan attainment and shift output.
- **R-046 [High]** The system shall show station-level actual/target/takt comparison and recent cycle trend.
- **R-047 [High]** The bottleneck station shall be automatically determinable from cycle-time data.
- **R-048 [High]** A basic Pareto view shall be available for quality defects and alarm sources.
- **R-049 [Medium]** KPI and report views shall be filterable by shift and date.

---

# 10. Technician Terminal

- **R-050 [High]** A technician shall be able to log into a station/shift using RFID/personnel number + PIN or an existing enterprise identity system.
- **R-051 [High]** The technician's active station, motor and task shall be shown in a single card/view.
- **R-052 [Medium]** Technician qualification/competency information shall be checkable during station assignment.

---

# 11. Admin and Configuration

- **R-053 [High]** Admin shall be able to manage OP code, operation name, station type, target cycle, PLC/Cell ID and tool information.
- **R-054 [High]** Users, roles and their permissions shall be manageable.
- **R-055 [High]** Subassembly → main-line feed/routing relationships shall be configurable.
- **R-056 [High]** Alarm rules such as severity, escalation time and default responsible team shall be configurable.
- **R-057 [High]** Connection/heartbeat status of PLC, tightening, database, live-data channel and camera/vision integrations shall be displayable.
- **R-058 [High]** Critical user actions, alarm changes, rework assignments and configuration/master-data changes shall be written to an audit log with user and timestamp information.

---

# 12. Data and Integration

- **R-059** PLC / Automation integration shall be able to provide station state, cycle start/finish, motor ID, sensor/IO, fault and heartbeat data.
- **R-060** Tightening integration shall be able to provide torque/angle, Pset, joint, result and tool/controller identity.
- **R-061** Vision integration shall be able to provide OP100 image, quality decision and motor serial-number association.
- **R-062 [High]** Motor genealogy, quality and audit data shall be stored persistently and shall survive application/system restart.
- **R-063 [High]** Production events, alarms and user actions shall contain reliable timestamps.
- **R-064 [High]** Motor, work order, part serial number, alarm, rework record and user-action records shall have unique identifiers.
- **R-065 [Medium]** A documented REST/JSON API between frontend and production data and a WebSocket-like channel for live data are preferred.

---

# 13. Visual and Usability

- **R-066** The main background shall be white/off-white/very light gray. Dense dark backgrounds shall not be used as the primary theme.
- **R-067** Light blue shall be used for information/active selection, soft pink for critical error/NOK emphasis, and pastel yellow for warning/takt-risk emphasis.
- **R-068** KPI cards, tables and panel headings shall have high readability.
- **R-069** OP codes shall be easy to distinguish in the visual hierarchy.
- **R-070** Critical states shall not be communicated using color alone; text and/or icons shall also be used.

---

# 14. Non-Functional Requirements

- **R-071** Standard page/screen interactions shall respond to user action within 2 seconds.
- **R-072** HTTPS shall be used and user passwords shall not be stored in plain text.
- **R-073** Application and database error logs shall be retained and accessible to the maintenance team.
- **R-074** When the data connection is temporarily interrupted, the connection state shall be clearly shown to the user.
- **R-075** A data backup and restore mechanism shall be defined before commissioning.

---

# 15. Supplier Deliverables

- **R-076** Analysis and detailed design documentation shall be delivered.
- **R-077** Approved UI/UX screen designs or an interactive prototype shall be delivered.
- **R-078** Installation/deployment documentation shall be delivered.
- **R-079** Admin and end-user documentation shall be delivered.
- **R-080** Source code and build/deployment instructions shall be delivered if included in the contract scope.
- **R-081** FAT/SAT or equivalent acceptance-test scenarios and test results shall be delivered.

---

# 16. Optional / Proposed / Unresolved Items

The following shall **not** automatically be classified as missing implementation during a code audit.

## Optional / Proposed

- Demo/test Play, Pause, Reset and speed controls are optional; the URS states that they *may* be present.
- ERP/MES integration is optional.
- REST/JSON + WebSocket is a preferred architecture, not a mandatory technology selection.
- The "Build Status / Part Completion Map" described at the end of the URS is an explicitly proposed additional function, not a mandatory baseline requirement.

## Requires Clarification

- OP100 camera count and exact vision architecture are not defined.
- Exact rework state-machine states are not fixed; the URS describes a similar/example flow.
- Technician authentication method is not fixed: RFID/PIN or enterprise identity are alternatives.
- KPI calculation formulas and exact source fields, especially OEE, FPY and plan attainment, are not defined.
- Exact bottleneck-detection algorithm is not defined.
- How and by whom low-stock minimum buffer levels are configured is not defined.
- Measurement conditions for the 2-second UI response and 1–3 second live-data target are not defined.
- Backup/restore technical implementation scope is not defined.

## To Be Finalized at Project Start

- PLC make/model, tag list and communication protocol
- Actual takt/target cycle values and shift plan
- Motor serial-number and work-order formats
- Actual serialized-part formats and scan points
- Barcode/QR/RFID hardware and reader model
- OP100 quality-control method, camera count and vision integration
- Tightening controller/system make, model and protocol
- Whether ERP/MES integration will exist
- User authentication method (local user, Active Directory, etc.)
- Data-retention periods, backup policy and cybersecurity policy

---

# 17. Acceptance Criteria Mapping

The URS acceptance criteria AC-01 ... AC-10 are treated as acceptance checks for the requirements above rather than as separate requirements.

Examples:

- AC-01 → R-011 + R-016
- AC-02 → R-014
- AC-03 → R-013
- AC-04 → R-030 + R-031
- AC-05 → R-028 + R-029
- AC-06 → R-033 + R-034 + R-036
- AC-07 → R-038
- AC-08 → R-025 + R-040 + R-058
- AC-09 → R-045
- AC-10 → R-010 + R-053 + R-055 + R-056 + R-057

---

# 18. Audit Rule

When this file is later compared against the repository:

- Do not infer that a feature exists merely because a similarly named file, component, route or comment exists.
- Mark a requirement as implemented only when there is code evidence supporting the required behavior.
- Use:
  - `IMPLEMENTED`
  - `PARTIAL`
  - `MISSING`
  - `UNCLEAR`
- Do not count optional, proposed or unresolved items as missing mandatory functionality unless project scope explicitly promotes them to required work.
- Do not use the HTML prototype as the source of truth for requirement compliance. It may be used separately as a product-intent / UX reference.
