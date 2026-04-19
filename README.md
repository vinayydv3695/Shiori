Flutter SDK for Anna's Archive Service.

## Features

- Returns a List of books based on a search request.
- Returns a List of books in a GoodReads collection.
- Returns a List of download links for a book.

## Getting started

## Usage

```dart
final annaApi = AnnaApi();
const searchRequest = SearchRequest(
    query: 'harry potter',
    categories: [Category.fiction],
    formats: [Format.epub, Format.pdf],
    skip:1,
    limit: 10,
    language: Language.french,
    sort: SortOption.smallest,
);

final books = await annaApi.find(searchRequest);
final downloadLinks = await annaApi.getDownloadLinks(books.first.md5);

const collectionRequest = CollectionRequest(
    type: Collection.goodReads,
    url: 'https://www.goodreads.com/list/show/200013._Reece_Reese_',
);
final goodReadsCollection = await annaApi.fetchCollection(collectionRequest);
```

## Additional information
