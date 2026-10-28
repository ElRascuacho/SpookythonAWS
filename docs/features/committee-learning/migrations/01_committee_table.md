# Staged infra — CommitteeTable

Promote only during an authorized implement/wiring task into `infra/template.yaml` (or equivalent). Not live until promoted.

## Up

- Table name parameter `CommitteeTableName` (default `SpookythonCommittee`).
- Billing mode PAY_PER_REQUEST.
- Attribute definitions: `pk` (S), `sk` (S).
- Key schema: HASH `pk`, RANGE `sk`.
- TTL enabled on attribute `ttl`.
- Point-in-time recovery: optional off for piloto cost.
- IAM: interactive API + worker read/write; no public access.

## Down

- Remove table resource and IAM statements added for Committee (destructive; requires ReleaseOperator).
