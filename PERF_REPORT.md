# Performance Analysis: `inform7.c`

**File:** `./submodules/inform/inform7/Tangled/inform7.c`  
**Size:** 260,065 lines, ~9.9 MB  
**Type:** Tangled/generated C output from [inweb](https://github.com/ganelson/inweb)  
**Analysis Date:** 2026-06-24

---

## Overview

This is a monolithic generated C file comprising the entire Inform 7 compiler. It is built from literate-programming source via `inweb`'s tangling process. The codebase uses several custom data structures (`text_stream`, `linked_list`, `dictionary`) with a custom memory allocator. Below is a whole-program analysis identifying performance bottlenecks, ordered by estimated impact.

---

## 🔴 Critical Hotspots (High Impact)

### 1. `Str__len()` is O(n) per call — 569 call sites, often in loop conditions

`Str__len()` calls `Streams__get_position()` which **traverses the entire `stream_continues` linked list** to sum `chars_written`:

```c
// line 33589
int Streams__get_position(text_stream *stream) {
    int t = 0;
    while (stream) {                          // O(k) where k = # of continuation segments
        t += stream->chars_written;
        stream = stream->stream_continues;
    }
    return t;
}
```

**The `LOOP_THROUGH_TEXT` macro calls `Str__len()` on every single iteration** — 818 uses:

```c
// line 754
#define LOOP_THROUGH_TEXT(P, ST)
    for (string_position P = Str__start(ST); P.index < Str__len(P.S); P.index++)
```

Iterating a string that has grown into 10 continuation segments costs **10× the work per character** just to check the loop bound.

**Several loops also fail to cache `Str__len()`:**

| Line | Pattern |
|------|---------|
| 37531 | `for (int i=0; i<Str__len(PPS.dest); i++)` |
| 37570 | `for (int i = 0; i < Str__len(line); i++)` |
| 37685 | `for (int i = 0; i < Str__len(text); i++)` |
| 38542 | `for (int i = 0; i < Str__len(text); i++)` |
| 38544 | `for (int j=i+2; j < Str__len(text); j++)` *(nested!)* |
| 38555 | `for (int i=0; i < Str__len(text); i++)` |
| 52490 | `for (int i=0; i<Str__len(prototype); i++)` |
| 52508 | `while ((i<Str__len(prototype)) && ...)` |

The better pattern (already used at lines 38823, 46592, 51089) is:

```c
for (int i=0, L=Str__len(text); i<L; i++) { ... }
```

**Fix:** Cache `Str__len()` before all loops. Fix the `LOOP_THROUGH_TEXT` macro to evaluate length once at loop start.

---

### 2. `Str__get_at()` is O(n) per character — 2,156 call sites

`Streams__get_char_at_index()` walks the continuation chain for every character access:

```c
// line 33612
wchar_t Streams__get_char_at_index(text_stream *stream, int position) {
    while (position >= stream->chars_written) {
        position = position - stream->chars_written;
        stream = stream->stream_continues;    // walk the chain
        if (stream == NULL) return 0;
    }
    return (stream->write_to_memory)[position];
}
```

**`Str__cmp()` compounds this** — it calls `Str__get_at()` for each character, making string comparison O(n×k):

```c
// line 37026
int Str__cmp(text_stream *S1, text_stream *S2) {
    int L1 = Str__len(S1), L2 = Str__len(S2), M = L1;
    if (L2 < M) M = L2;
    for (int i=0; i<M; i++) {
        int d = (int) Str__get_at(S1, i) - (int) Str__get_at(S2, i);  // O(k) each!
        if (d != 0) return d;
    }
    return L1 - L2;
}
```

**Fix:** Add a `chars_written_cumulative` field to each continuation segment so position lookup is O(1). Or add a direct pointer to the current write segment in `text_stream` for sequential access patterns.

---

### 3. `Tokenisation__go` — 21,848-line monolithic function (line 199192)

This is the single largest function in the file. It processes Inter schemas character-by-character with:

- Deeply nested switch/case statements spanning thousands of lines
- **51+ `Str__get_at()` calls** in just the first 500 lines
- Multiple inner loops that also call `Str__get_at()` and `Str__len()`
- `TEMPORARY_TEXT` allocations inside inner loops
- Repeated token-type detection logic (lines ~650-750) duplicated across multiple token states

**Fix:** Break this function into smaller focused functions. Factor out the repeated token-type detection logic.

---

### 4. Dictionary hash function is O(n×k) — called on every lookup

`Dictionaries__hash()` uses `LOOP_THROUGH_TEXT` which calls `Str__len()` on every character:

```c
// line 34200
int Dictionaries__hash(text_stream *K, int N) {
    unsigned int hash = 0;
    LOOP_THROUGH_TEXT(P, K)
        hash = 16339*hash + ((unsigned int) Str__get(P));
    return (int) (hash % ((unsigned int) N));
}
```

**Fix:** Cache the hash value in the `text_stream` struct (recompute only when the string changes). Or use a faster hash like FNV-1a that can be computed incrementally.

---

### 5. Dictionary rehashing allocates an entirely new table

When `no_entries > hash_table_size`, the code allocates a new dictionary, re-inserts every entry, then frees the old table:

```c
// line 34143
if (D->no_entries > D->hash_table_size) {
    dictionary *D2 = Dictionaries__new(2*D->hash_table_size, D->textual);
    for (int i=0; i<D->hash_table_size; i++)
        for (dict_entry *E = &(D->hash_table[i]); E; E = E->next_in_entry)
            if (E->vacant == FALSE) {
                dict_entry *E2 = Dictionaries__find_p(D2, E->key, 1);
                E2->value = E->value;
            }
    Memory__I7_free(D->hash_table, DICTIONARY_MREASON,
        D->hash_table_size*((int) sizeof(dict_entry)));
    D->hash_table_size = D2->hash_table_size;
    D->hash_table = D2->hash_table;
}
```

**Fix:** Use `realloc()` to grow the hash table in-place and rehash entries without allocating a whole new dictionary structure.

---

## 🟡 Medium Impact Opportunities

### 6. Memory allocation overhead — every `CREATE` uses mutex + metadata

Every `CREATE(type_name)` call goes through `Memory__allocate()` (line 32611) which:

- Adds a `memory_frame` header (24+ bytes per allocation)
- Adds `SAFETY_MARGIN` (128 bytes) of padding after each allocation
- Uses `LOCK_MUTEX`/`UNLOCK_MUTEX` for thread safety
- Allocates in 800KB granularity blocks (`MEMORY_GRANULARITY = 100*1024*8`)

With **283 declared classes** and **331 class references**, object allocation is a significant cost.

**Fix:** For single-threaded usage (which this appears to be), remove the mutex. Reduce `SAFETY_MARGIN` from 128 to a smaller value (16-32). Consider a bump-allocator for short-lived objects.

---

### 7. 1,418 `LOG()`/`LOGIF()` calls — debug logging in production

These are debugging log calls that may be compiled into release builds. Each call formats strings and writes to output streams even when logging is disabled.

**Fix:** Ensure `LOG()` and `LOGIF()` expand to nothing when debug flags are off at compile time (not just a runtime check).

---

### 8. `Str__duplicate()` called 213 times — unnecessary copying

Each call allocates a new `text_stream` and copies the entire string content. Many of these are for dictionary keys that are never modified.

**Fix:** Use reference-counted or copy-on-write strings for dictionary keys and other read-mostly strings.

---

### 9. `TEMPORARY_TEXT` / `DISCARD_TEXT` — 964 stack allocations

Each `TEMPORARY_TEXT(T)` allocates a 2048-wide-character buffer on the stack (~16 KB on x86-64). With 964 uses, this adds up to significant stack pressure.

**Fix:** Reduce the default buffer size for common cases, or use a smaller default with dynamic growth.

---

### 10. Linked list operations are O(n) for indexed access

`LinkedLists__entry()` and `LinkedLists__delete()` walk the list from the head for every indexed access. With 347 `LOOP_OVER_LINKED_LIST` uses, iteration is fine but random access is costly.

**Fix:** Where indexed access is needed (e.g., `LinkedLists__set_entry`), consider using a dynamic array instead.

---

## 🟢 Low-Hanging Fruit (Quick Wins)

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 11 | **Uncached `Str__len()` in loops** | Lines 37531, 37570, 37685, 38542, 38544, 38555, 52490, 52508 | Cache `L = Str__len(text)` before loop |
| 12 | **Nested `Str__len()` in inner loop** | Line 38544: `for (int j=i+2; j < Str__len(text); j++)` | Cache length in outer loop too |
| 13 | **`Str__len()` called on every `LOOP_THROUGH_TEXT` iteration** | Line 754 (macro definition) | Evaluate length once at loop start |
| 14 | **`Streams__putc()` walks continuation chain on every write** | Line 33460: `while (stream->stream_continues) stream = stream->stream_continues;` | Cache the tail pointer in the head struct |
| 15 | **`Streams__get_char_at_index()` walks continuation chain** | Line 33612 | Add cumulative offset to each continuation for O(1) lookup |
| 16 | **`Str__cmp()` calls `Str__get_at()` per character** | Line 37026 | Use direct memory access when both strings are in single segments |
| 17 | **`Dictionaries__hash()` uses `LOOP_THROUGH_TEXT`** | Line 34200 | Cache hash in `text_stream` or use incremental FNV-1a |
| 18 | **Dictionary rehashing allocates entirely new table** | Line 34143 | Use `realloc()` + in-place rehash |
| 19 | **`Memory__allocate()` mutex for single-threaded use** | Line 32611 | Remove mutex for single-threaded builds |
| 20 | **`SAFETY_MARGIN` of 128 bytes per allocation** | Line 410 | Reduce to 16-32 bytes |

---

## Code Statistics Summary

| Metric | Count |
|--------|-------|
| Total lines | 260,065 |
| Function definitions | ~16,312 |
| `void` functions | 6,377 |
| `int` functions | 4,901 |
| `Str__*` calls | 16,941 |
| `Str__get_at()` calls | 2,156 |
| `Str__len()` calls | 569 |
| `Str__new()` calls | 196 |
| `Str__duplicate()` calls | 213 |
| `LOOP_THROUGH_TEXT` uses | 818 |
| `LOOP_OVER_LINKED_LIST` uses | 347 |
| `LOOP_OVER` (object iteration) uses | 293 |
| `TEMPORARY_TEXT` uses | 964 |
| `LOG()`/`LOGIF()` calls | 1,418 |
| `WRITE()`/`WRITE_TO()` calls | 5,102 |
| `malloc()` calls | 7 |
| `free()` calls | 161 |
| `qsort()` calls | 12 |
| `for` loops | 1,644 |
| `while` loops | 575 |
| `goto` statements | 61 |
| Declared classes | 283 |
| `LOCK_MUTEX`/`UNLOCK_MUTEX` | 22 |

---

## Architectural Root Cause

The biggest systemic performance problem is the **`text_stream` continuation chain**. When a string grows beyond its initial capacity (default 32 bytes for `Str__new()`, 2048 for `TEMPORARY_TEXT`), a new continuation segment is allocated and all subsequent operations must walk this chain. For strings that grow large (e.g., during compilation output), this makes every character access and length check O(k) where k can be 10-100+.

### Recommended Single Highest-Impact Change

1. **Add a `chars_written_cumulative` field** to each continuation segment for O(1) position lookup
2. **Cache the tail pointer** in the head `text_stream` to avoid walking for writes
3. **Fix `LOOP_THROUGH_TEXT`** to evaluate `Str__len()` once at loop start

This would improve the performance of **all** string operations — 16,941 `Str__` calls, 2,156 `Str__get_at` calls, 569 `Str__len` calls, and 818 `LOOP_THROUGH_TEXT` iterations.
