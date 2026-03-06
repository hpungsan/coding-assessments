# WAL (Write-Ahead Logging)

## Definition

**WAL** is a recovery technique where the database records changes in an **append-only log** (the "write-ahead log") **before** applying those changes to the main data files.

> Rule of thumb: **log first, data later.**

WAL enables crash recovery by replaying or undoing changes based on the log.

## What WAL is used for

* **Durability**: committed work can be redone after crash
* **Atomicity**: uncommitted work can be undone after crash (or never redone)
* **Recovery**: restore database to a correct state

## Core WAL rule (the "write-ahead" part)

Before a modified data page is written to disk, the log records describing that modification must be flushed to disk **first**.

This prevents a situation where the data file contains changes that the log does not know about (which would break recovery).

---

# WAL record types (conceptual)

Exact format varies (Postgres, InnoDB, Oracle, etc.), but conceptually:

## 1) Transaction boundary records

* `BEGIN/START TRANSACTION`
* `COMMIT`
* `ABORT/ROLLBACK`

## 2) Data change records

Often includes enough information to **redo** and/or **undo**:

* REDO info: how to re-apply the change
* UNDO info: how to revert the change

Example conceptual log records:

* `<T1, page=P5, offset=..., old=500, new=400>` (contains both)
  or separate redo/undo records depending on design.

## 3) Checkpoints

A **checkpoint** is a marker indicating that data pages up to a certain log position are safely reflected in data files, which reduces recovery time.

---

# WAL + COMMIT: what "commit" usually means

In many WAL-based DBs, a transaction is considered **durable committed** when:

1. its relevant log records are written to the WAL buffer
2. the WAL buffer is **flushed to disk** up to and including the **COMMIT record** (or commit LSN)

Then, even if the data pages are not yet written, recovery can redo the transaction from WAL.

### Group commit (performance optimization)

To reduce expensive disk flushes, databases often batch multiple transactions:

* many transactions commit around the same time
* one disk flush persists WAL for all of them

---

# Crash Recovery with WAL (REDO + UNDO)

After a crash, the database uses WAL to restore correctness.

## Basic idea

* If a transaction **committed**, ensure its changes exist on disk (**REDO** if necessary).
* If a transaction **did not commit**, ensure its partial changes are removed (**UNDO**).

## Typical recovery phases (ARIES-style approach, widely influential)

1. **Analysis**: figure out which transactions were active at crash time and which pages might be dirty
2. **Redo**: re-apply changes from WAL that might not have made it to data files
3. **Undo**: roll back effects of transactions that were not committed

(Details vary, but this is the common shape.)

---

# Buffer management policies that pair with WAL

Databases cache pages in memory ("buffer pool") and write them to disk later. Two policy choices matter:

## STEAL vs NO-STEAL

* **STEAL**: DB may write a dirty page to disk even if it contains uncommitted changes.

  * Needs UNDO during recovery (because uncommitted changes can reach disk).
* **NO-STEAL**: never flush uncommitted changes to disk.

  * Easier recovery, but often worse memory/IO flexibility.

## FORCE vs NO-FORCE

* **FORCE**: at commit, all modified pages are forced to disk.

  * Simplifies durability (no redo), but slow.
* **NO-FORCE**: at commit, pages do not have to be written; only WAL must be flushed.

  * Needs REDO during recovery, but faster commits.

Most high-performance systems use **STEAL + NO-FORCE**, enabled by WAL (needs both UNDO and REDO).

---

# WAL + Isolation (how they relate)

WAL primarily supports **atomicity** and **durability**.
**Isolation** is mostly enforced by:

* locking, MVCC, or optimistic concurrency

However, WAL interacts with isolation because:

* MVCC systems often log changes for durability while readers use versioning for isolation
* locks may be released at commit, and commit durability is tied to WAL flush (depending on DB)

---

# Example: [ACID](acid.md) + WAL in a money transfer

## Transaction T1

* BEGIN
* Update account A: 500 → 400
* Update account B: 300 → 400
* COMMIT

## What happens internally (simplified)

1. T1 updates data pages in memory (buffer pool)
2. DB appends WAL records describing both updates
3. On COMMIT:

   * DB writes COMMIT record to WAL
   * DB flushes WAL to disk (or via group commit)
4. Data pages may be written later by background writer

## Crash scenarios

### Crash before COMMIT flush

* WAL doesn't show durable commit
* Recovery UNDOs any partial effects (atomicity)

### Crash after COMMIT flush but before data pages written

* WAL contains committed changes
* Recovery REDOs changes (durability)

---

# Practical notes / interview-ready points

## Why WAL is fast

* WAL is **append-only** → sequential writes
* data pages are random IO; WAL avoids forcing random IO at commit

## Checkpoints

* Reduce recovery time by limiting how far back redo must scan
* Typically created periodically or based on WAL size

## Replication tie-in

Many systems ship WAL/log records to replicas:

* Postgres streaming replication ships WAL
* Some DBs ship logical changes derived from WAL

## Durability modes

Some systems allow:

* synchronous commit (strict durability)
* asynchronous commit (faster, may lose last few committed txns on crash)

---

# Quick glossary

* **Transaction**: a sequence of operations treated as one unit.
* **Commit**: make transaction effects permanent.
* **Rollback/Abort**: undo transaction effects.
* **WAL**: append-only log written before data files.
* **Redo**: reapply committed changes after crash.
* **Undo**: revert uncommitted changes after crash.
* **Checkpoint**: point where DB records progress so recovery is faster.
* **Buffer pool**: in-memory cache of database pages.
* **Dirty page**: a page modified in memory but not yet written to disk.
* **Fsync/flush**: force buffered writes to stable storage.

---

# One-line summary

**WAL**: a recovery method that logs changes before applying them, enabling durability + atomicity with efficient commits.
