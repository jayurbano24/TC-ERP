/**
 * PX Reception — matriz de mutaciones vs GET snapshot (Fase 3 audit).
 *
 * | Mutation              | API        | Response sufficient?     | GET? | Cache update              |
 * |-----------------------|------------|--------------------------|------|---------------------------|
 * | scan (success)        | POST       | yes (scan result)        | NO   | optimistic overlay        |
 * | scan (duplicate OS)   | POST err   | no                       | YES  | ERROR_RECONCILIATION      |
 * | scan (box full)       | POST err   | no                       | YES  | ERROR_RECONCILIATION      |
 * | closeBox              | POST       | yes (status, version)    | NO   | patchPxCacheAfterCloseBox |
 * | reopenBox             | POST       | yes (status, version)    | NO   | patchPxCacheAfterReopenBox|
 * | adjustBox             | POST       | yes (declared, version)  | NO   | patchPxCacheAfterAdjustBox|
 * | addLot (existing box) | POST lots  | partial (declaredQty)    | NO   | patchPxCacheAfterAppendLot|
 * | addLot (new box)      | POST box   | partial (id, box_code)   | NO   | patchPxCacheAfterCreateBox|
 * | deleteEquipment       | POST void  | yes (counts, version)    | NO   | local overlay + meta patch|
 * | deleteBox             | DELETE     | no full snapshot         | NO   | local state patch         |
 * | deleteBox (error)     | DELETE err | no                       | YES  | ERROR_RECONCILIATION      |
 * | saveHeader            | PATCH      | yes (full snapshot)      | NO   | ingestSnapshot / cache    |
 * | startReception        | POST       | needs START GET          | YES  | START (no equipment)      |
 * | resume                | GET        | n/a                      | YES  | RESUME (with equipment)   |
 * | finalize              | POST       | partial                  | NO   | clear session             |
 * | soft refresh          | timer cmd  | n/a                      | YES  | SOFT_REFRESH (coalesced)  |
 */
export const PX_RECEPTION_MUTATION_AUDIT = 'px-reception-mutation-audit-v1' as const;
