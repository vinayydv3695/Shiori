# SQL bench — label: ab_noidx

db: /home/zura/Personal/coding_cuff/Shiori/perf/bench/../seed/bench.db (3150 books, 1100-chapter series, FTS populated)

| query | n | median ms | p95/per-op ms | note |
|---|---|---|---|---|
| Q1_default_page_keyset | 30 | 0.408 | 0.444 | median/p95 ms |
| Q1b_default_page_offset | 30 | 1.395 | 1.613 | median/p95 ms |
| Q2_fts_prefix_page | 30 | 0.724 | 0.739 | median/p95 ms |
| Q2b_fts_count | 30 | 0.600 | 0.612 | median/p95 ms |
| Q3_series_books_all | 30 | 3.846 | 4.174 | median/p95 ms |
| Q4_status_update_one | 200 | 22.996 | 0.115 | 200 autocommit updates (idempotent values) |
| Q5_linkage_update_one | 200 | 2.557 | 0.013 | 200 autocommit linkage updates (idempotent values) |
| Q6_library_stats | 30 | 0.397 | 0.416 | median/p95 ms |
| Q7_count_default | 30 | 0.071 | 0.074 | median/p95 ms |
| Q8_author_sort_page | 30 | 1.967 | 2.101 | median/p95 ms |
| Q9_attach_authors_50 | 30 | 0.037 | 0.039 | median/p95 ms |
| Q10_manga_domain_page | 30 | 0.530 | 0.552 | median/p95 ms |
| Q11_series_volumes | 30 | 0.621 | 0.635 | median/p95 ms |
| Q12_series_list_1000 | 30 | 0.004 | 0.006 | median/p95 ms |
| Q5b_linkage_update_x200_1tx | 200 | 0.878 | 0.004 | ONE transaction (idempotent values) |
| Q4b_status_update_x200_1tx | 200 | 1.350 | 0.007 | ONE transaction (idempotent values) |

## Query plans (EXPLAIN QUERY PLAN)

**Q1_default_page_keyset**
```
SEARCH b USING INDEX idx_books_in_trash (in_trash=?)
USE TEMP B-TREE FOR ORDER BY
```

**Q1b_default_page_offset**
```
SEARCH b USING INDEX idx_books_in_trash (in_trash=?)
USE TEMP B-TREE FOR ORDER BY
```

**Q2_fts_prefix_page**
```
SCAN fts VIRTUAL TABLE INDEX 0:M6
SEARCH b USING INTEGER PRIMARY KEY (rowid=?)
USE TEMP B-TREE FOR DISTINCT
USE TEMP B-TREE FOR ORDER BY
```

**Q2b_fts_count**
```
USE TEMP B-TREE FOR count(DISTINCT)
SCAN fts VIRTUAL TABLE INDEX 0:M6
SEARCH b USING INTEGER PRIMARY KEY (rowid=?)
```

**Q3_series_books_all**
```
SEARCH books USING INDEX idx_books_manga_series (manga_series_id=?)
USE TEMP B-TREE FOR ORDER BY
```

**Q6_library_stats**
```
SCAN books
```

**Q7_count_default**
```
SEARCH b USING COVERING INDEX idx_books_in_trash (in_trash=?)
```

**Q8_author_sort_page**
```
MATERIALIZE am
SCAN ba USING COVERING INDEX sqlite_autoindex_books_authors_1
SEARCH a USING INTEGER PRIMARY KEY (rowid=?)
SEARCH b USING COVERING INDEX idx_books_in_trash (in_trash=?)
BLOOM FILTER ON am (am_book_id=?)
SEARCH am USING AUTOMATIC COVERING INDEX (am_book_id=?) LEFT-JOIN
USE TEMP B-TREE FOR DISTINCT
USE TEMP B-TREE FOR ORDER BY
```

**Q9_attach_authors_50**
```
SEARCH ba USING INDEX idx_books_authors_book_order (book_id=?)
SEARCH a USING INTEGER PRIMARY KEY (rowid=?)
```

**Q10_manga_domain_page**
```
SEARCH b USING INDEX idx_books_in_trash (in_trash=?)
USE TEMP B-TREE FOR ORDER BY
```

**Q11_series_volumes**
```
SEARCH books USING INDEX idx_books_manga_series (manga_series_id=?)
USE TEMP B-TREE FOR ORDER BY
```

**Q12_series_list_1000**
```
SCAN manga_series
USE TEMP B-TREE FOR ORDER BY
```
