-- PT-2 ONE-OFF: re-tear the gym leaked by run 27416770368 — its teardown hit
-- the proposed_by FK (no ON DELETE) before the 000044 fix made it SET NULL.
SELECT teardown_e2e_gym('e2e-27416770368-1');
