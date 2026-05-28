# Graph Report - /Users/lienli/Documents/GitHub/memo-ref/graphiti  (2026-05-27)

## Corpus Check
- 245 files · ~321,060 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3463 nodes · 12351 edges · 80 communities detected
- Extraction: 34% EXTRACTED · 66% INFERRED · 0% AMBIGUOUS · INFERRED: 8160 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]

## God Nodes (most connected - your core abstractions)
1. `EntityNode` - 312 edges
2. `EntityEdge` - 267 edges
3. `EpisodicNode` - 239 edges
4. `Message` - 229 edges
5. `EpisodeType` - 226 edges
6. `GraphProvider` - 179 edges
7. `LLMConfig` - 154 edges
8. `GraphDriver` - 134 edges
9. `RateLimitError` - 126 edges
10. `FalkorDriver` - 123 edges

## Surprising Connections (you probably didn't know these)
- `test_add_bulk()` --calls--> `assert_episodic_edge_equals()`  [INFERRED]
  /Users/lienli/Documents/GitHub/memo-ref/graphiti/tests/test_graphiti_mock.py → /Users/lienli/Documents/GitHub/memo-ref/graphiti/tests/helpers_test.py
- `test_entity_node_rejects_unsafe_labels()` --calls--> `EntityNode`  [INFERRED]
  /Users/lienli/Documents/GitHub/memo-ref/graphiti/tests/test_node_label_security.py → /Users/lienli/Documents/GitHub/memo-ref/graphiti/graphiti_core/nodes.py
- `test_entity_node_assignment_rejects_unsafe_labels()` --calls--> `EntityNode`  [INFERRED]
  /Users/lienli/Documents/GitHub/memo-ref/graphiti/tests/test_node_label_security.py → /Users/lienli/Documents/GitHub/memo-ref/graphiti/graphiti_core/nodes.py
- `Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2` --uses--> `Graphiti`  [INFERRED]
  /Users/lienli/Documents/GitHub/memo-ref/graphiti/tests/test_entity_exclusion_int.py → /Users/lienli/Documents/GitHub/memo-ref/graphiti/graphiti_core/graphiti.py
- `Test excluding the default 'Entity' type while keeping custom types.` --uses--> `Graphiti`  [INFERRED]
  /Users/lienli/Documents/GitHub/memo-ref/graphiti/tests/test_entity_exclusion_int.py → /Users/lienli/Documents/GitHub/memo-ref/graphiti/graphiti_core/graphiti.py

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (202): ABC, _community_edge_from_record(), CommunityEdgeOperations, FalkorCommunityEdgeOperations, KuzuCommunityEdgeOperations, Neo4jCommunityEdgeOperations, NeptuneCommunityEdgeOperations, Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2 (+194 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (56): add_nodes_and_edges_bulk_tx(), label_propagation(), Neighbor, get_community_edge_save_query(), get_entity_edge_return_query(), get_entity_edge_save_bulk_query(), get_entity_edge_save_query(), get_episodic_edge_save_bulk_query() (+48 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (320): BaseModel, add_nodes_and_edges_bulk(), Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2, # FIXME: Kuzu's UNWIND does not currently support STRUCT[] type properly, so we, Combined extraction: single LLM call per episode for both nodes and edges., Separate extraction: two sequential LLM calls per episode (legacy)., Resolve entity duplicates across an in-memory batch using a two-pass strategy., # NOTE: this loop is O(n^2) in the number of nodes inside the batch because we r (+312 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (289): AnthropicClient, Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2, A client for the Anthropic LLM.      Args:         config: A configuration objec, Extract JSON from text content.          A helper method to extract JSON from te, Create a tool definition based on the response_model if provided, or a generic J, Get the maximum output tokens for a specific Anthropic model.          Args:, Resolve the maximum output tokens to use based on precedence rules.          Pre, Generate a response from the Anthropic LLM using tool-based approach for all req (+281 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (233): AzureOpenAIEmbedderClient, AzureOpenAILLMClient, main(), Copyright 2025, Zep Software, Inc.  Licensed under the Apache License, Version 2, Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2, Wrapper class for Azure OpenAI that implements the EmbedderClient interface., Create embeddings using Azure OpenAI client., Create batch embeddings using Azure OpenAI client. (+225 more)

### Community 5 - "Community 5"
Cohesion: 0.02
Nodes (180): _build_directed_uuid_map(), compress_uuid_map(), dedupe_edges_bulk(), dedupe_nodes_bulk(), extract_nodes_and_edges_bulk(), _extract_nodes_and_edges_bulk_combined(), _extract_nodes_and_edges_bulk_separate(), resolve_edge_pointers() (+172 more)

### Community 6 - "Community 6"
Cohesion: 0.02
Nodes (138): City, Initialize the queue service with a graphiti client.          Args:, Test concurrent tool calls and operations., Test multiple concurrent search operations., Test different types of operations running concurrently., Test asynchronous queue operations and episode processing., Verify episodes are processed sequentially within a group., Test async error handling and recovery. (+130 more)

### Community 7 - "Community 7"
Cohesion: 0.02
Nodes (124): apply_capped_attributes(), cap_string_attributes(), _check_value_against_cap(), _field_is_required(), _field_max_length(), Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2, Decide whether ``value`` exceeds the cap and on which axis.      Returns ``(exce, Drop string (or list-of-string) attributes whose value exceeds a length cap. (+116 more)

### Community 8 - "Community 8"
Cohesion: 0.02
Nodes (86): delete_by_uuids(), get_between_nodes(), get_by_group_ids(), get_by_node_uuid(), get_by_uuid(), get_by_uuids(), get_community_edge_from_record(), get_entity_edge_from_record() (+78 more)

### Community 9 - "Community 9"
Cohesion: 0.03
Nodes (93): Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2, validate_entity_types(), EdgesNotFoundError, EntityTypeValidationError, GraphitiError, GroupIdValidationError, GroupsNodesNotFoundError, NodeLabelValidationError (+85 more)

### Community 10 - "Community 10"
Cohesion: 0.02
Nodes (73): LLMCache, Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2, Simple SQLite + JSON cache for LLM responses.      Replaces diskcache to avoid u, main(), Copyright 2025, Zep Software, Inc.  Licensed under the Apache License, Version 2, main(), build_baseline_graph(), build_graph() (+65 more)

### Community 11 - "Community 11"
Cohesion: 0.05
Nodes (57): BGERerankerClient, Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2, rank(), CrossEncoderClient, GeminiRerankerClient, Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2, Google Gemini Reranker Client, Initialize the GeminiRerankerClient with the provided configuration and client. (+49 more)

### Community 12 - "Community 12"
Cohesion: 0.04
Nodes (43): convert_datetimes_to_strings(), Document, Event, Location, Object, Organization, Preference, Procedure (+35 more)

### Community 13 - "Community 13"
Cohesion: 0.06
Nodes (31): BaseSettings, retrieve_previous_episodes_bulk(), Message, Result, get_settings(), Settings, add_entity_node(), add_messages() (+23 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (39): generate_test_report(), GraphitiTestClient, Wait for episodes to be processed with intelligent polling.          Args:, Test core Graphiti operations., Track test performance metrics., Test search and retrieval operations., Test episode lifecycle operations., Enhanced test client for comprehensive Graphiti MCP testing. (+31 more)

### Community 15 - "Community 15"
Cohesion: 0.08
Nodes (35): build_communities(), build_community(), determine_entity_community(), generate_summary_description(), get_community_clusters(), summarize_pair(), update_community(), build_community_edges() (+27 more)

### Community 16 - "Community 16"
Cohesion: 0.1
Nodes (3): close(), session(), transaction()

### Community 17 - "Community 17"
Cohesion: 0.21
Nodes (11): capture_event(), get_anonymous_id(), get_graphiti_version(), initialize_posthog(), is_telemetry_enabled(), Telemetry client for Graphiti.  Collects anonymous usage statistics to help impr, Check if telemetry is enabled., Get or create anonymous user ID. (+3 more)

### Community 18 - "Community 18"
Cohesion: 0.17
Nodes (0): 

### Community 19 - "Community 19"
Cohesion: 0.17
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 0.17
Nodes (0): 

### Community 21 - "Community 21"
Cohesion: 0.17
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 0.17
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 0.18
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 0.18
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 0.2
Nodes (7): PydanticBaseSettingsSource, Custom settings source for loading from YAML files., Recursively expand environment variables in configuration values., Get field value from YAML config., Load and parse YAML configuration., settings_customise_sources(), YamlSettingsSource

### Community 26 - "Community 26"
Cohesion: 0.2
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 0.22
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 0.25
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 0.29
Nodes (3): create_azure_credential_token_provider(), Utility functions for Graphiti MCP Server., Create Azure credential token provider for managed identity authentication.

### Community 30 - "Community 30"
Cohesion: 0.33
Nodes (5): get_parameter_position(), handle_multiple_group_ids(), Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2, Returns the positional index of a parameter in the function signature.     If th, Decorator for FalkorDB methods that need to handle multiple group_ids.     Runs

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (1): Add attributes to the span.

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (1): Set the status of the span.

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (1): Record an exception in the span.

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (1): Start a new span with the given name.

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (1): Start a new OpenTelemetry span with the configured prefix.

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (1): Rank the given passages based on their relevance to the query.          Args:

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (1): Calculate operation duration in seconds.

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (1): Verify server initializes with all required tools.

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (1): Test adding text-based memories.

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (1): Test adding structured JSON memories.

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (1): Test adding conversation/message memories.

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (1): Test semantic search for nodes.

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (1): Test fact search with various filters.

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (1): Test hybrid search combining semantic and keyword search.

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (1): Test retrieving episodes with pagination.

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (1): Test deleting specific episodes.

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (1): Test retrieving entity edges.

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (1): Test deleting entity edges.

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (1): Test handling of invalid tool arguments.

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (1): Test timeout handling for long operations.

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (1): Test handling of concurrent operations.

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (1): Measure and validate operation latencies.

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (1): Test efficiency of batch operations.

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (1): Test operations with different database backends.

### Community 69 - "Community 69"
Cohesion: 1.0
Nodes (1): Generate a realistic company profile.

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (1): Generate a realistic conversation.

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (1): Generate technical documentation content.

### Community 72 - "Community 72"
Cohesion: 1.0
Nodes (1): Generate a news article.

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (1): Generate a user profile.

### Community 74 - "Community 74"
Cohesion: 1.0
Nodes (0): 

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (0): 

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (1): Customize settings sources to include YAML.

### Community 77 - "Community 77"
Cohesion: 1.0
Nodes (0): 

### Community 78 - "Community 78"
Cohesion: 1.0
Nodes (0): 

### Community 79 - "Community 79"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **343 isolated node(s):** `Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2`, `Test that short text is returned unchanged.`, `Test that empty text is handled correctly.`, `Test text at exactly max_chars.`, `Test truncation at sentence boundary with period.` (+338 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 31`** (1 nodes): `conftest.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `Add attributes to the span.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (1 nodes): `Set the status of the span.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `Record an exception in the span.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (1 nodes): `Start a new span with the given name.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (1 nodes): `Start a new OpenTelemetry span with the configured prefix.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `Rank the given passages based on their relevance to the query.          Args:`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `main.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `Calculate operation duration in seconds.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `Verify server initializes with all required tools.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `Test adding text-based memories.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `Test adding structured JSON memories.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `Test adding conversation/message memories.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `Test semantic search for nodes.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `Test fact search with various filters.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `Test hybrid search combining semantic and keyword search.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `Test retrieving episodes with pagination.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `Test deleting specific episodes.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `Test retrieving entity edges.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `Test deleting entity edges.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `Test handling of invalid tool arguments.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `Test timeout handling for long operations.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `Test handling of concurrent operations.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `Measure and validate operation latencies.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `Test efficiency of batch operations.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `Test operations with different database backends.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `Generate a realistic company profile.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `Generate a realistic conversation.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `Generate technical documentation content.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `Generate a news article.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `Generate a user profile.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `Customize settings sources to include YAML.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GraphProvider` connect `Community 0` to `Community 1`, `Community 2`, `Community 5`, `Community 8`, `Community 9`, `Community 16`, `Community 30`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Why does `EntityNode` connect `Community 2` to `Community 0`, `Community 1`, `Community 4`, `Community 5`, `Community 8`, `Community 9`, `Community 10`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `EpisodeType` connect `Community 2` to `Community 0`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 10`, `Community 13`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Are the 306 inferred relationships involving `EntityNode` (e.g. with `Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2` and `Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2`) actually correct?**
  _`EntityNode` has 306 INFERRED edges - model-reasoned connections that need verification._
- **Are the 261 inferred relationships involving `EntityEdge` (e.g. with `Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2` and `Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2`) actually correct?**
  _`EntityEdge` has 261 INFERRED edges - model-reasoned connections that need verification._
- **Are the 235 inferred relationships involving `EpisodicNode` (e.g. with `Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2` and `Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2`) actually correct?**
  _`EpisodicNode` has 235 INFERRED edges - model-reasoned connections that need verification._
- **Are the 227 inferred relationships involving `Message` (e.g. with `SimpleResponseModel` and `Copyright 2024, Zep Software, Inc.  Licensed under the Apache License, Version 2`) actually correct?**
  _`Message` has 227 INFERRED edges - model-reasoned connections that need verification._