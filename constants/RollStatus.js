/**
 * Roll status enum
 * Defines valid states for a roll proposal
 */
export const RollStatus = {
  PROPOSED: 'proposed',    // Roll proposed but not yet confirmed
  CONFIRMED: 'confirmed',  // Roll confirmed by editor
  EXECUTED: 'executed',    // Roll has been executed (dice rolled)
};

/**
 * Check if a status is valid
 */
export function isValidRollStatus(status) {
  return Object.values(RollStatus).includes(status);
}

/**
 * Get human-readable status name
 */
export function getStatusDisplayName(status) {
  switch (status) {
  case RollStatus.PROPOSED:
    return 'proposed';
  case RollStatus.CONFIRMED:
    return 'confirmed';
  case RollStatus.EXECUTED:
    return 'executed';
  default:
    return status;
  }
}

export default RollStatus;

