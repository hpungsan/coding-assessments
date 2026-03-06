# ACID (Database Transactions)

## Definition

**ACID** is a set of guarantees that a database system aims to provide for **transactions** (a unit of work, often multiple reads/writes that should behave as one logical operation). ACID makes transactions reliable in the presence of **crashes**, **concurrent access**, and **software/hardware failures**.

A **transaction** typically has:

* **BEGIN**
* a sequence of reads/writes
* **COMMIT** (make it permanent) or **ROLLBACK/ABORT** (undo it)

---

# A — Atomicity

## Meaning

**Atomicity = "all or nothing."**
If a transaction contains multiple changes, either **all** changes become visible, or **none** do.

## Why it matters

Without atomicity, partial updates can corrupt business invariants:

* money transferred out but not into the other account
* inventory decremented but order not created

## Example (money transfer)

Transaction T:

1. A.balance -= 100
2. B.balance += 100

Atomicity requires:

* If the system crashes after step (1) but before step (2), then step (1) must be undone during recovery.

## Typical mechanisms

* **Undo logging / rollback segments**
* **Write-Ahead Logging ([WAL](wal.md))** with undo/redo
* **Transaction manager** that can abort and roll back

---

# C — Consistency

## Meaning

**Consistency = "preserve correctness rules."**
A transaction must take the database from one **valid state** to another **valid state**, respecting:

* constraints (PK/FK/UNIQUE/CHECK)
* triggers
* application invariants (e.g., "balance never negative")

## Important nuance

Consistency is partly:

* **Database-enforced** (constraints, FK, checks)
* **Application-enforced** (business logic)

ACID "Consistency" does **not** mean "all replicas are instantly consistent" (that's a distributed-systems usage of "consistency").

## Example

Constraint: `balance >= 0`
A withdrawal transaction must fail/rollback if it would violate the constraint.

## Typical mechanisms

* Constraints validated at statement/commit time
* Transactions + isolation (to avoid inconsistent intermediate reads)
* Correct application logic

---

# I — Isolation

## Meaning

**Isolation = "transactions don't step on each other."**
When multiple transactions run concurrently, the outcome should be equivalent to some **serial order** (one-after-another) — ideally **serializable**.

In practice, many systems offer multiple isolation levels (a tradeoff between correctness and performance).

## Common concurrency anomalies (what isolation prevents)

### 1) Dirty Read

T1 writes X but hasn't committed yet. T2 reads that uncommitted X.
If T1 rolls back, T2 read garbage.

### 2) Non-Repeatable Read

T1 reads row R twice, but T2 commits an update to R in between → T1 sees different values.

### 3) Phantom Read

T1 repeats a query (e.g., `COUNT(*) WHERE status='PENDING'`) and sees new rows inserted by T2.

### 4) Lost Update

T1 and T2 both read X=10, both write X=11 → one increment is lost.

### 5) Write Skew (classic serializable anomaly under snapshot isolation)

T1 and T2 each read overlapping data and make writes that individually appear safe, but together violate a constraint.

## Isolation levels (high-level)

(Exact guarantees vary slightly by DB vendor, but these are standard concepts.)

### READ UNCOMMITTED

* Allows dirty reads
* Rarely used

### READ COMMITTED

* Prevents dirty reads
* Still allows non-repeatable reads and phantoms
* Common default in many systems

### REPEATABLE READ

* Ensures repeated reads of the same row return the same value
* Phantom behavior varies by DB implementation

### SERIALIZABLE

* Strongest: result equivalent to some serial order
* Implemented via:

  * strict locking (2PL)
  * predicate locks / range locks
  * serialization graph / SSI (e.g., PostgreSQL's serializable)

## Typical mechanisms

* **Locks** (shared/exclusive, intention locks)
* **MVCC** (Multi-Version Concurrency Control) + snapshot reads
* **Optimistic concurrency control**
* **Serializable enforcement** (2PL/SSI)

---

# D — Durability

## Meaning

**Durability = "committed means permanent."**
Once a transaction **commits**, its effects must survive:

* power loss
* process crash
* OS crash

## Typical mechanisms

* **[WAL](wal.md)** + `fsync()` at commit (or group commit)
* stable storage guarantees
* replication (often improves availability; durability still typically depends on local WAL + fsync or synchronous replication)

## Important nuance

Some systems allow "relaxed durability" modes for performance (e.g., async commit), where a committed transaction might be lost in a sudden crash.

---

# One-line summary

**ACID**: guarantees reliable transactions under concurrency and failures.
