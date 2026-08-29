# Roles and Notification Routing

This document describes the deployed email routing and administration permissions for Penny Lane Estates HOA. Assigning multiple roles to one account combines the permissions and message categories for those roles. Email recipient lists are deduplicated before delivery.

## General email routing

| Notification | Recipients |
| --- | --- |
| Sign-in code | Resident requesting the code |
| New resident registration | Active administrators and super administrators |
| Registration approved or rejected | Applicant |
| Household-member access request | Active administrators and super administrators |
| Guest registered or revoked | Active administrators and super administrators |
| Pool card marked lost or stolen | Active administrators and super administrators |
| Announcement | Active residents who enabled announcement email |
| Event | Active residents who enabled event email |

## Message routing

| Message category | Email recipients and portal visibility |
| --- | --- |
| General | Board members and super administrators |
| Maintenance | Board members and super administrators |
| Board | Board members and super administrators |
| Architectural / ACC | ACC Committee members and super administrators |
| Treasurer | Treasurers and super administrators |
| Amenities | Amenities coordinators and super administrators |

Resident replies follow the category of the original conversation. An administrator reply is always saved in the resident portal and is also emailed when the resident has direct-message email enabled. Public contact-form replies are sent to the address entered on the form.

A normal administrator does not automatically receive or gain access to routed messages. The account must also hold the applicable board, ACC, treasurer, or amenities assignment. Super administrators can access every message category.

## Clubhouse reservation routing

| Notification | Recipients |
| --- | --- |
| Initial reservation request | Amenities coordinators only |
| Request reviewed or denied | Resident who submitted the request |
| Deposit paid | Amenities coordinators, treasurers, and super administrators |
| Deposit refunded | Amenities coordinators, treasurers, and super administrators |
| Deposit retained | Amenities coordinators, treasurers, super administrators, and board members |
| Deposit-retention notice | Always saved in the resident portal; also emailed when direct-message email is enabled |

An administrator review does not publish a reservation. The resident continues to see `Pending`, and the requested period remains unavailable to competing requests. The reservation changes to `Approved` and appears as `Clubhouse Reserved` on the members calendar only after Stripe confirms the deposit payment.

## Administration permissions

| Assignment | Administration access |
| --- | --- |
| Super administrator | Every section and message category; reservations and deposits; account-role assignment; permanent deletion and history cleanup |
| Administrator | Overview, accounts, properties, pool access, website content, quick links, announcements, events, documents, photos, and reservation management |
| Board member | General, maintenance, and board messages |
| ACC Committee member | Architectural / ACC messages |
| Treasurer | Reservation list, deposit refund/retain controls, and treasurer messages |
| Amenities coordinator | Reservation review, approval/denial, cancellation, clubhouse settings, deposit refund/retain controls, and amenities messages |

### Permission details

- Administrators can approve or deny reservations. They cannot refund or retain deposits unless they are also a treasurer or amenities coordinator; super administrators can always manage deposits.
- A normal administrator can open the Messages section but sees only categories granted by an additional committee assignment.
- Amenities coordinators do not need the administrator role to manage clubhouse reservations and deposits.
- Treasurers can view reservations and manage deposits but cannot approve requests unless they are also an administrator or amenities coordinator.
- Board and ACC assignments alone do not grant access to accounts, properties, events, documents, photos, or website management.
- President, vice president, secretary, and treasurer assignments also confer board-member status.
- Accounts with multiple assignments receive the combined permissions and message access of those assignments.

