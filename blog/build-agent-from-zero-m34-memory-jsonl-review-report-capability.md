# Build Agent From Zero: M34 Memory JSONL Review Report Capability

M34 gives structured review data its own discovery handle.

## Broad Names Are Useful Until They Are Not

The JSONL memory plugin already had:

`memory.jsonl.review`

That works as a broad marker: this plugin can provide durable review projection.

But the review family now has several shapes:

- typed report;
- Markdown audit view;
- health block;
- full audit snapshot.

One broad descriptor is no longer enough for a workbench that wants to enable precise panels.

## The New Descriptor

M34 adds:

`memory.jsonl.review_report`

It maps to the structured data path:

`JsonlMemoryStore.readReviewReport()`

The old descriptor stays.

The new one just makes the typed report explicit.

## Why This Is Still Not A Tool

The report is an inspection surface.

It should be discoverable.

It should be testable.

It should carry trust metadata.

But it does not need to become model-callable execution yet.

Capability descriptors let us expose product shape without prematurely widening the action surface.

## The Pattern

As Guga grows, capability names should become more precise when host surfaces become more precise.

Start broad.

Add specific descriptors when the API family splits into different UI or automation uses.

Keep compatibility descriptors in place.

M34 applies that rule to durable memory review reports.
