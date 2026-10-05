# 0008 — Latitude/longitude columns + Haversine instead of PostGIS in Phase 1

**Status:** Accepted. **Deviates from PLAN.md §6.3 / §10.2**, which use PostGIS.

**Context.** Phase 1 matching ranks the technicians of one business, typically under 50 people. Service areas are defined by pincodes (PLAN §7.5), not polygons.

**Decision.** Store `latitude` / `longitude` as `double precision` on addresses and technicians, wrapped in the `GeoLocation` value object. The matching engine filters candidates in SQL (active, skill, area) and computes Haversine distance in memory for the remaining few. The plain `postgres` image is used.

**Revisit when** service areas become polygons, or candidate counts reach the thousands. Switching then means adding the PostGIS extension and a generated `geography` column. The value object and the matching interfaces stay the same.
