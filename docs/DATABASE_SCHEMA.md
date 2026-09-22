# Database Schema — KelasKu Foundation v1.2.1

## System
- `00_README`
- `01_APP_CONFIG`
- `02_APP_RELEASES`

## User
- `10_USERS`
- `11_USER_IDENTITIES`
- `12_USER_SETTINGS`
- `13_SESSIONS`

## Class Foundation
- `20_CLASSES`
- `21_CLASS_MEMBERS`

## Academic Foundation
- `30_TASKS`
- `31_SCHEDULES`
- `32_ANNOUNCEMENTS`
- `33_MATERIALS`

## Notification
- `40_NOTIFICATIONS`
- `41_NOTIFICATION_READS`

## Storage
- `50_FILES`

## System Log
- `98_ERROR_LOG`
- `99_AUDIT_LOG`

## Identity rule

Primary internal key user: `user_id`.

Public application ID: `kelasku_id`.

NIM/NIS/NISN/NIK berada di `11_USER_IDENTITIES`, bukan primary key.
