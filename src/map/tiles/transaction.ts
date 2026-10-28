/** Inactive experimental publication journal. No renderer, scheduler or save imports.
 * Prepare resources off-scene, then describe synchronous publication operations.
 * Each undo must tolerate an apply that throws after doing only part of its work.
 * Persistent writes must not be staged here: rollback is for runtime ownership only.
 */
export interface PublicationStep {
  label: string;
  apply: () => void;
  undo: () => void;
}
export type PublicationState = 'prepared' | 'activating' | 'active' | 'rolling-back' | 'rolled-back' | 'failed';

/** ES2020-compatible aggregate; preserve all causes without requiring newer browser Error APIs. */
export class TilePublicationError extends Error {
  constructor(
    message: string,
    public readonly errors: readonly unknown[],
  ) {
    super(message);
    this.name = 'TilePublicationError';
  }
}

export class TilePublication {
  private status: PublicationState = 'prepared';
  private armed: PublicationStep[] = [];
  private readonly steps: readonly PublicationStep[];
  constructor(steps: readonly PublicationStep[]) {
    // Copy the journal so a caller cannot append/change an operation during activation.
    this.steps = steps.map(step => ({ ...step }));
  }
  get state(): PublicationState {
    return this.status;
  }

  activate(): void {
    if (this.status !== 'prepared') throw new Error(`cannot activate publication in ${this.status}`);
    this.status = 'activating';
    try {
      for (const step of this.steps) {
        this.armed.push(step); // arm BEFORE apply, so partial effects can also be undone
        step.apply();
      }
      this.status = 'active';
    } catch (error) {
      const undoErrors = this.unwind();
      throw new TilePublicationError('tile activation failed; rollback attempted', [error, ...undoErrors]);
    }
  }

  rollback(): void {
    if (this.status === 'rolled-back') return;
    if (this.status !== 'active' && this.status !== 'prepared')
      throw new Error(`cannot roll back publication in ${this.status}`);
    const errors = this.unwind();
    if (errors.length) throw new TilePublicationError('tile rollback failed; resource requires recovery', errors);
  }

  private unwind(): unknown[] {
    this.status = 'rolling-back';
    const errors: unknown[] = [];
    while (this.armed.length) {
      const step = this.armed.pop()!;
      try {
        step.undo();
      } catch (cause) {
        errors.push(new TilePublicationError(`undo failed: ${step.label}`, [cause]));
      }
    }
    this.status = errors.length ? 'failed' : 'rolled-back';
    return errors;
  }
}
