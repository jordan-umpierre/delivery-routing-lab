/**
 * Deterministic binary min-heap keyed by (cost, node id).
 * Ties always break toward the lower node id so identical inputs
 * produce identical expansion orders on every run and platform.
 */
export class MinHeap {
  private costs: number[] = [];
  private ids: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(cost: number, id: number): void {
    this.costs.push(cost);
    this.ids.push(id);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  /** Remove and return the [cost, id] pair with the smallest key. */
  pop(): [number, number] {
    if (this.ids.length === 0) throw new Error("heap: empty");
    const top: [number, number] = [this.costs[0]!, this.ids[0]!];
    const lastCost = this.costs.pop()!;
    const lastId = this.ids.pop()!;
    if (this.ids.length > 0) {
      this.costs[0] = lastCost;
      this.ids[0] = lastId;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.less(l, m)) m = l;
        if (r < this.ids.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private less(a: number, b: number): boolean {
    return (
      this.costs[a]! < this.costs[b]! ||
      (this.costs[a] === this.costs[b] && this.ids[a]! < this.ids[b]!)
    );
  }

  private swap(a: number, b: number): void {
    [this.costs[a], this.costs[b]] = [this.costs[b]!, this.costs[a]!];
    [this.ids[a], this.ids[b]] = [this.ids[b]!, this.ids[a]!];
  }
}
