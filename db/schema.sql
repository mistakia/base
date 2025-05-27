--
-- PostgreSQL database dump
--

-- Dumped from database version 15.12 (Ubuntu 15.12-1.pgdg24.04+1)
-- Dumped by pg_dump version 15.12 (Ubuntu 15.12-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
SET search_path = public;

ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.tags DROP CONSTRAINT IF EXISTS tags_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sync_conflicts DROP CONSTRAINT IF EXISTS sync_conflicts_sync_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sync_conflicts DROP CONSTRAINT IF EXISTS sync_conflicts_resolved_by_fkey;
ALTER TABLE IF EXISTS ONLY public.sync_configs DROP CONSTRAINT IF EXISTS sync_configs_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.physical_locations DROP CONSTRAINT IF EXISTS physical_locations_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.physical_items DROP CONSTRAINT IF EXISTS physical_items_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.persons DROP CONSTRAINT IF EXISTS persons_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.organizations DROP CONSTRAINT IF EXISTS organizations_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.guidelines DROP CONSTRAINT IF EXISTS guidelines_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.entity_sync_records DROP CONSTRAINT IF EXISTS entity_sync_records_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.entity_tags DROP CONSTRAINT IF EXISTS entity_tags_tag_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.entity_tags DROP CONSTRAINT IF EXISTS entity_tags_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.entity_relations DROP CONSTRAINT IF EXISTS entity_relations_target_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.entity_relations DROP CONSTRAINT IF EXISTS entity_relations_source_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.entity_observations DROP CONSTRAINT IF EXISTS entity_observations_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.entity_metadata DROP CONSTRAINT IF EXISTS entity_metadata_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.entity_blocks DROP CONSTRAINT IF EXISTS entity_blocks_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.entity_blocks DROP CONSTRAINT IF EXISTS entity_blocks_block_id_fkey;
ALTER TABLE IF EXISTS ONLY public.entities DROP CONSTRAINT IF EXISTS entities_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.digital_items DROP CONSTRAINT IF EXISTS digital_items_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.database_tables DROP CONSTRAINT IF EXISTS database_tables_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.database_table_views DROP CONSTRAINT IF EXISTS database_table_views_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.database_table_views DROP CONSTRAINT IF EXISTS database_table_views_database_table_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.database_table_items DROP CONSTRAINT IF EXISTS database_table_items_entity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.database_table_items DROP CONSTRAINT IF EXISTS database_table_items_database_table_id_fkey;
ALTER TABLE IF EXISTS ONLY public.blocks DROP CONSTRAINT IF EXISTS blocks_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.block_relationships DROP CONSTRAINT IF EXISTS block_relationships_target_block_id_fkey;
ALTER TABLE IF EXISTS ONLY public.block_relationships DROP CONSTRAINT IF EXISTS block_relationships_source_block_id_fkey;
ALTER TABLE IF EXISTS ONLY public.block_attributes DROP CONSTRAINT IF EXISTS block_attributes_block_id_fkey;
ALTER TABLE IF EXISTS ONLY public.activities DROP CONSTRAINT IF EXISTS activities_entity_id_fkey;
DROP TRIGGER IF EXISTS trigger_update_digital_items_search_vector ON public.digital_items;
DROP TRIGGER IF EXISTS trigger_update_block_search_vector ON public.blocks;
DROP TRIGGER IF EXISTS refresh_activities_view_trigger ON public.entities;
DROP TRIGGER IF EXISTS entity_blocks_audit ON public.entity_blocks;
DROP TRIGGER IF EXISTS entities_audit ON public.entities;
DROP INDEX IF EXISTS public.idx_unique_tag_entities;
DROP INDEX IF EXISTS public.idx_unique_entity_relations;
DROP INDEX IF EXISTS public.idx_tasks_status;
DROP INDEX IF EXISTS public.idx_tasks_finish_by;
DROP INDEX IF EXISTS public.idx_sync_conflicts_sync_id;
DROP INDEX IF EXISTS public.idx_sync_conflicts_status;
DROP INDEX IF EXISTS public.idx_sync_configs_entity_type;
DROP INDEX IF EXISTS public.idx_sync_configs_entity_id;
DROP INDEX IF EXISTS public.idx_physical_location_coordinates;
DROP INDEX IF EXISTS public.idx_guideline_status;
DROP INDEX IF EXISTS public.idx_guideline_effective_date;
DROP INDEX IF EXISTS public.idx_entity_sync_records_external;
DROP INDEX IF EXISTS public.idx_entity_sync_records_entity_id;
DROP INDEX IF EXISTS public.idx_entity_tags_tag_id;
DROP INDEX IF EXISTS public.idx_entity_relations_type;
DROP INDEX IF EXISTS public.idx_entity_relations_target_type;
DROP INDEX IF EXISTS public.idx_entity_relations_target;
DROP INDEX IF EXISTS public.idx_entity_relations_source_type;
DROP INDEX IF EXISTS public.idx_entity_relations_source;
DROP INDEX IF EXISTS public.idx_entity_observations_category;
DROP INDEX IF EXISTS public.idx_entity_metadata_key;
DROP INDEX IF EXISTS public.idx_entity_embedding;
DROP INDEX IF EXISTS public.idx_entity_blocks_entity_id;
DROP INDEX IF EXISTS public.idx_entity_blocks_block_id;
DROP INDEX IF EXISTS public.idx_entities_user_id;
DROP INDEX IF EXISTS public.idx_entities_updated_at;
DROP INDEX IF EXISTS public.idx_entities_type;
DROP INDEX IF EXISTS public.idx_entities_markdown_gin;
DROP INDEX IF EXISTS public.idx_entities_git_sha;
DROP INDEX IF EXISTS public.idx_entities_frontmatter;
DROP INDEX IF EXISTS public.idx_entities_file_path_user;
DROP INDEX IF EXISTS public.idx_entities_file_path;
DROP INDEX IF EXISTS public.idx_entities_description_gin;
DROP INDEX IF EXISTS public.idx_entities_created_at;
DROP INDEX IF EXISTS public.idx_entities_content_gin;
DROP INDEX IF EXISTS public.idx_entities_archived_at;
DROP INDEX IF EXISTS public.idx_digital_items_search;
DROP INDEX IF EXISTS public.idx_database_items_parent;
DROP INDEX IF EXISTS public.idx_change_requests_updated_at;
DROP INDEX IF EXISTS public.idx_change_requests_target_branch;
DROP INDEX IF EXISTS public.idx_change_requests_status;
DROP INDEX IF EXISTS public.idx_change_requests_github_repo;
DROP INDEX IF EXISTS public.idx_change_requests_github_pr_number;
DROP INDEX IF EXISTS public.idx_change_requests_created_at;
DROP INDEX IF EXISTS public.idx_blocks_user_id;
DROP INDEX IF EXISTS public.idx_blocks_updated_at;
DROP INDEX IF EXISTS public.idx_blocks_type;
DROP INDEX IF EXISTS public.idx_blocks_search;
DROP INDEX IF EXISTS public.idx_blocks_embedding;
DROP INDEX IF EXISTS public.idx_blocks_created_at;
DROP INDEX IF EXISTS public.idx_blocks_block_cid;
DROP INDEX IF EXISTS public.idx_block_relationships_type;
DROP INDEX IF EXISTS public.idx_block_relationships_target;
DROP INDEX IF EXISTS public.idx_block_relationships_source;
DROP INDEX IF EXISTS public.idx_audit_log_table_record;
DROP INDEX IF EXISTS public.idx_audit_log_changed_at;
DROP INDEX IF EXISTS public.idx_activities_view_entity_id;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_public_key_key;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_pkey;
ALTER TABLE IF EXISTS ONLY public.task_tags DROP CONSTRAINT IF EXISTS task_tags_pkey;
ALTER TABLE IF EXISTS ONLY public.task_physical_items DROP CONSTRAINT IF EXISTS task_physical_items_pkey;
ALTER TABLE IF EXISTS ONLY public.task_persons DROP CONSTRAINT IF EXISTS task_persons_pkey;
ALTER TABLE IF EXISTS ONLY public.task_parents DROP CONSTRAINT IF EXISTS task_parents_pkey;
ALTER TABLE IF EXISTS ONLY public.task_organizations DROP CONSTRAINT IF EXISTS task_organizations_pkey;
ALTER TABLE IF EXISTS ONLY public.task_digital_items DROP CONSTRAINT IF EXISTS task_digital_items_pkey;
ALTER TABLE IF EXISTS ONLY public.task_dependencies DROP CONSTRAINT IF EXISTS task_dependencies_pkey;
ALTER TABLE IF EXISTS ONLY public.task_activities DROP CONSTRAINT IF EXISTS task_activities_pkey;
ALTER TABLE IF EXISTS ONLY public.tags DROP CONSTRAINT IF EXISTS tags_pkey;
ALTER TABLE IF EXISTS ONLY public.sync_conflicts DROP CONSTRAINT IF EXISTS sync_conflicts_pkey;
ALTER TABLE IF EXISTS ONLY public.sync_configs DROP CONSTRAINT IF EXISTS sync_configs_pkey;
ALTER TABLE IF EXISTS ONLY public.physical_locations DROP CONSTRAINT IF EXISTS physical_locations_pkey;
ALTER TABLE IF EXISTS ONLY public.physical_items DROP CONSTRAINT IF EXISTS physical_items_pkey;
ALTER TABLE IF EXISTS ONLY public.physical_item_tags DROP CONSTRAINT IF EXISTS physical_item_tags_pkey;
ALTER TABLE IF EXISTS ONLY public.physical_item_child_items DROP CONSTRAINT IF EXISTS physical_item_child_items_pkey;
ALTER TABLE IF EXISTS ONLY public.persons DROP CONSTRAINT IF EXISTS persons_pkey;
ALTER TABLE IF EXISTS ONLY public.organizations DROP CONSTRAINT IF EXISTS organizations_pkey;
ALTER TABLE IF EXISTS ONLY public.organization_persons DROP CONSTRAINT IF EXISTS organization_persons_pkey;
ALTER TABLE IF EXISTS ONLY public.guidelines DROP CONSTRAINT IF EXISTS guidelines_pkey;
ALTER TABLE IF EXISTS ONLY public.entity_sync_records DROP CONSTRAINT IF EXISTS entity_sync_records_pkey;
ALTER TABLE IF EXISTS ONLY public.entity_sync_records DROP CONSTRAINT IF EXISTS entity_sync_records_entity_id_external_system_external_id_key;
ALTER TABLE IF EXISTS ONLY public.entity_tags DROP CONSTRAINT IF EXISTS entity_tags_pkey;
ALTER TABLE IF EXISTS ONLY public.entity_relations DROP CONSTRAINT IF EXISTS entity_relations_pkey;
ALTER TABLE IF EXISTS ONLY public.entity_observations DROP CONSTRAINT IF EXISTS entity_observations_pkey;
ALTER TABLE IF EXISTS ONLY public.entity_metadata DROP CONSTRAINT IF EXISTS entity_metadata_pkey;
ALTER TABLE IF EXISTS ONLY public.entity_metadata DROP CONSTRAINT IF EXISTS entity_metadata_entity_id_key_key;
ALTER TABLE IF EXISTS ONLY public.entity_blocks DROP CONSTRAINT IF EXISTS entity_blocks_pkey;
ALTER TABLE IF EXISTS ONLY public.entities DROP CONSTRAINT IF EXISTS entities_pkey;
ALTER TABLE IF EXISTS ONLY public.digital_items DROP CONSTRAINT IF EXISTS digital_items_pkey;
ALTER TABLE IF EXISTS ONLY public.digital_item_tags DROP CONSTRAINT IF EXISTS digital_item_tags_pkey;
ALTER TABLE IF EXISTS ONLY public.database_tables DROP CONSTRAINT IF EXISTS database_tables_table_name_entity_id_key;
ALTER TABLE IF EXISTS ONLY public.database_tables DROP CONSTRAINT IF EXISTS database_tables_pkey;
ALTER TABLE IF EXISTS ONLY public.database_table_views DROP CONSTRAINT IF EXISTS database_table_views_view_name_entity_id_key;
ALTER TABLE IF EXISTS ONLY public.database_table_views DROP CONSTRAINT IF EXISTS database_table_views_pkey;
ALTER TABLE IF EXISTS ONLY public.database_table_tags DROP CONSTRAINT IF EXISTS database_table_tags_pkey;
ALTER TABLE IF EXISTS ONLY public.database_table_items DROP CONSTRAINT IF EXISTS database_table_items_pkey;
ALTER TABLE IF EXISTS ONLY public.change_requests DROP CONSTRAINT IF EXISTS change_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.change_requests DROP CONSTRAINT IF EXISTS change_requests_feature_branch_key;
ALTER TABLE IF EXISTS ONLY public.blocks DROP CONSTRAINT IF EXISTS blocks_pkey;
ALTER TABLE IF EXISTS ONLY public.blocks DROP CONSTRAINT IF EXISTS blocks_block_cid_key;
ALTER TABLE IF EXISTS ONLY public.block_relationships DROP CONSTRAINT IF EXISTS block_relationships_source_block_id_target_block_id_relatio_key;
ALTER TABLE IF EXISTS ONLY public.block_relationships DROP CONSTRAINT IF EXISTS block_relationships_pkey;
ALTER TABLE IF EXISTS ONLY public.block_attributes DROP CONSTRAINT IF EXISTS block_attributes_pkey;
ALTER TABLE IF EXISTS ONLY public.block_attributes DROP CONSTRAINT IF EXISTS block_attributes_block_id_key_key;
ALTER TABLE IF EXISTS ONLY public.audit_log DROP CONSTRAINT IF EXISTS audit_log_pkey;
ALTER TABLE IF EXISTS ONLY public.activities DROP CONSTRAINT IF EXISTS activities_pkey;
DROP TABLE IF EXISTS public.users;
DROP VIEW IF EXISTS public.text_document_view;
DROP TABLE IF EXISTS public.tasks;
DROP TABLE IF EXISTS public.task_tags;
DROP VIEW IF EXISTS public.task_physical_items_view;
DROP TABLE IF EXISTS public.task_physical_items;
DROP VIEW IF EXISTS public.task_persons_view;
DROP TABLE IF EXISTS public.task_persons;
DROP TABLE IF EXISTS public.task_parents;
DROP VIEW IF EXISTS public.task_parent_child_view;
DROP VIEW IF EXISTS public.task_organizations_view;
DROP TABLE IF EXISTS public.task_organizations;
DROP VIEW IF EXISTS public.task_digital_items_view;
DROP TABLE IF EXISTS public.task_digital_items;
DROP VIEW IF EXISTS public.task_dependencies_view;
DROP TABLE IF EXISTS public.task_dependencies;
DROP TABLE IF EXISTS public.task_activities;
DROP TABLE IF EXISTS public.tags;
DROP TABLE IF EXISTS public.sync_conflicts;
DROP TABLE IF EXISTS public.sync_configs;
DROP TABLE IF EXISTS public.physical_locations;
DROP TABLE IF EXISTS public.physical_items;
DROP TABLE IF EXISTS public.physical_item_tags;
DROP VIEW IF EXISTS public.physical_item_hierarchy_view;
DROP TABLE IF EXISTS public.physical_item_child_items;
DROP TABLE IF EXISTS public.persons;
DROP VIEW IF EXISTS public.person_organizations_view;
DROP TABLE IF EXISTS public.organizations;
DROP TABLE IF EXISTS public.organization_persons;
DROP VIEW IF EXISTS public.organization_members_view;
DROP VIEW IF EXISTS public.guideline_with_activities;
DROP TABLE IF EXISTS public.guidelines;
DROP TABLE IF EXISTS public.entity_sync_records;
DROP VIEW IF EXISTS public.entity_stats;
DROP TABLE IF EXISTS public.entity_tags;
DROP TABLE IF EXISTS public.entity_observations;
DROP TABLE IF EXISTS public.entity_metadata;
DROP VIEW IF EXISTS public.entity_hierarchies_view;
DROP TABLE IF EXISTS public.entity_blocks;
DROP TABLE IF EXISTS public.digital_items;
DROP TABLE IF EXISTS public.digital_item_tags;
DROP TABLE IF EXISTS public.database_tables;
DROP TABLE IF EXISTS public.database_table_views;
DROP TABLE IF EXISTS public.database_table_tags;
DROP TABLE IF EXISTS public.database_table_items;
DROP TABLE IF EXISTS public.change_requests;
DROP TABLE IF EXISTS public.blocks;
DROP TABLE IF EXISTS public.block_relationships;
DROP TABLE IF EXISTS public.block_attributes;
DROP TABLE IF EXISTS public.audit_log;
DROP VIEW IF EXISTS public.activity_guidelines_view;
DROP TABLE IF EXISTS public.entity_relations;
DROP MATERIALIZED VIEW IF EXISTS public.activities_view;
DROP TABLE IF EXISTS public.activities;
DROP VIEW IF EXISTS public.active_entities;
DROP TABLE IF EXISTS public.entities;
DROP FUNCTION IF EXISTS public.update_digital_items_search_vector();
DROP FUNCTION IF EXISTS public.update_block_search_vector();
DROP FUNCTION IF EXISTS public.refresh_activities_view();
DROP FUNCTION IF EXISTS public.process_audit_log();
DROP FUNCTION IF EXISTS public.is_entity_synced_with_git(p_entity_id uuid, p_git_sha character varying);
DROP FUNCTION IF EXISTS public.entity_similarity_search(query_embedding public.vector, entity_types public.entity_type[], similarity_threshold double precision, max_results integer);
DROP FUNCTION IF EXISTS public.block_similarity_search(query_embedding public.vector, block_types public.block_type[], similarity_threshold double precision, max_results integer);
DROP TYPE IF EXISTS public.task_status_type;
DROP TYPE IF EXISTS public.priority_type;
DROP TYPE IF EXISTS public.importance_type;
DROP TYPE IF EXISTS public.guideline_status_type;
DROP TYPE IF EXISTS public.frequency_type;
DROP TYPE IF EXISTS public.entity_type;
DROP TYPE IF EXISTS public.change_request_status_type;
DROP TYPE IF EXISTS public.block_type;
DROP EXTENSION IF EXISTS vector;
DROP EXTENSION IF EXISTS "uuid-ossp";
--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: block_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.block_type AS ENUM (
    'markdown_file',
    'heading',
    'paragraph',
    'list',
    'list_item',
    'code',
    'blockquote',
    'table',
    'table_row',
    'table_cell',
    'image',
    'thematic_break',
    'callout',
    'bookmark',
    'equation',
    'file',
    'video',
    'html_block'
);


--
-- Name: change_request_status_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.change_request_status_type AS ENUM (
    'Draft',
    'PendingReview',
    'NeedsRevision',
    'Approved',
    'Rejected',
    'Merged',
    'Closed'
);


--
-- Name: entity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.entity_type AS ENUM (
    'activity',
    'database',
    'database_item',
    'database_view',
    'digital_item',
    'guideline',
    'organization',
    'person',
    'physical_item',
    'physical_location',
    'prompt',
    'tag',
    'task',
    'text',
    'type_definition',
    'type_extension'
);


--
-- Name: frequency_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.frequency_type AS ENUM (
    'Daily',
    'Weekly',
    'Infrequent'
);


--
-- Name: guideline_status_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.guideline_status_type AS ENUM (
    'Draft',
    'Approved',
    'Deprecated'
);


--
-- Name: importance_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.importance_type AS ENUM (
    'Core',
    'Standard',
    'Premium',
    'Potential'
);


--
-- Name: priority_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.priority_type AS ENUM (
    'None',
    'Low',
    'Medium',
    'High',
    'Critical'
);


--
-- Name: task_status_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_status_type AS ENUM (
    'No status',
    'Waiting',
    'Paused',
    'Planned',
    'Started',
    'In Progress',
    'Completed',
    'Cancelled',
    'Blocked'
);


--
-- Name: block_similarity_search(public.vector, public.block_type[], double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.block_similarity_search(query_embedding public.vector, block_types public.block_type[] DEFAULT NULL::public.block_type[], similarity_threshold double precision DEFAULT 0.7, max_results integer DEFAULT 10) RETURNS TABLE(block_id uuid, block_cid text, type public.block_type, content text, similarity double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.block_id,
    b.block_cid,
    b.type,
    b.content,
    1 - (b.embedding <=> query_embedding) AS similarity
  FROM
    blocks b
  WHERE
    b.embedding IS NOT NULL
    AND (block_types IS NULL OR b.type = ANY(block_types))
    AND 1 - (b.embedding <=> query_embedding) > similarity_threshold
  ORDER BY
    b.embedding <=> query_embedding
  LIMIT max_results;
END;
$$;


--
-- Name: entity_similarity_search(public.vector, public.entity_type[], double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.entity_similarity_search(query_embedding public.vector, entity_types public.entity_type[] DEFAULT NULL::public.entity_type[], similarity_threshold double precision DEFAULT 0.7, max_results integer DEFAULT 10) RETURNS TABLE(entity_id uuid, title character varying, type public.entity_type, description text, similarity double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.entity_id,
    e.title,
    e.type,
    e.description,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM
    entities e
  WHERE
    e.archived_at IS NULL
    AND e.embedding IS NOT NULL
    AND (entity_types IS NULL OR e.type = ANY(entity_types))
    AND 1 - (e.embedding <=> query_embedding) > similarity_threshold
  ORDER BY
    e.embedding <=> query_embedding
  LIMIT max_results;
END;
$$;


--
-- Name: is_entity_synced_with_git(uuid, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_entity_synced_with_git(p_entity_id uuid, p_git_sha character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  current_sha VARCHAR;
BEGIN
  SELECT git_sha INTO current_sha
  FROM entities
  WHERE entity_id = p_entity_id;

  RETURN current_sha = p_git_sha;
END;
$$;


--
-- Name: process_audit_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_audit_log() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  audit_row audit_log;
  entity_user_id UUID;
BEGIN
  -- Get the user ID if available
  IF TG_OP = 'DELETE' THEN
    entity_user_id := OLD.user_id;
  ELSE
    entity_user_id := NEW.user_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    audit_row = ROW(
      uuid_generate_v1(),
      TG_TABLE_NAME::VARCHAR,
      OLD.entity_id,
      'D',
      row_to_json(OLD),
      NULL,
      entity_user_id,
      NOW()
    );
  ELSIF TG_OP = 'UPDATE' THEN
    audit_row = ROW(
      uuid_generate_v1(),
      TG_TABLE_NAME::VARCHAR,
      NEW.entity_id,
      'U',
      row_to_json(OLD),
      row_to_json(NEW),
      entity_user_id,
      NOW()
    );
  ELSIF TG_OP = 'INSERT' THEN
    audit_row = ROW(
      uuid_generate_v1(),
      TG_TABLE_NAME::VARCHAR,
      NEW.entity_id,
      'I',
      NULL,
      row_to_json(NEW),
      entity_user_id,
      NOW()
    );
  END IF;

  INSERT INTO audit_log VALUES (audit_row.*);
  RETURN NULL;
END;
$$;


--
-- Name: refresh_activities_view(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_activities_view() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY activities_view;
  RETURN NULL;
END;
$$;


--
-- Name: update_block_search_vector(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_block_search_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$;


--
-- Name: update_digital_items_search_vector(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_digital_items_search_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.text, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE((SELECT markdown FROM entities WHERE entity_id = NEW.entity_id), '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.html, '')), 'C');
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entities (
    entity_id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    title character varying(255) NOT NULL,
    type public.entity_type NOT NULL,
    permalink character varying(255),
    description text NOT NULL,
    user_id uuid NOT NULL,
    embedding public.vector(1536),
    git_sha character varying(40),
    content text,
    markdown text,
    frontmatter jsonb,
    absolute_path character varying(500),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    archived_at timestamp without time zone,
    base_relative_path character varying(500),
    CONSTRAINT check_archived_at CHECK (((archived_at IS NULL) OR (archived_at >= updated_at))),
    CONSTRAINT check_text_fields CHECK (((type <> 'text'::public.entity_type) OR ((markdown IS NOT NULL) AND (frontmatter IS NOT NULL) AND (absolute_path IS NOT NULL)))),
    CONSTRAINT check_updated_at CHECK (((updated_at IS NULL) OR (updated_at >= created_at)))
);


--
-- Name: active_entities; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.active_entities AS
 SELECT entities.entity_id,
    entities.title,
    entities.type,
    entities.permalink,
    entities.description,
    entities.user_id,
    entities.embedding,
    entities.git_sha,
    entities.content,
    entities.markdown,
    entities.frontmatter,
    entities.absolute_path AS file_path,
    entities.created_at,
    entities.updated_at,
    entities.archived_at
   FROM public.entities
  WHERE (entities.archived_at IS NULL);


--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    entity_id uuid NOT NULL
);


--
-- Name: activities_view; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.activities_view AS
 SELECT entities.entity_id,
    entities.title,
    entities.description,
    entities.user_id,
    entities.created_at,
    entities.updated_at
   FROM public.entities
  WHERE ((entities.type = 'activity'::public.entity_type) AND (entities.archived_at IS NULL))
  WITH NO DATA;


--
-- Name: entity_relations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_relations (
    relation_id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    source_entity_id uuid NOT NULL,
    target_entity_id uuid,
    relation_type character varying(50) NOT NULL,
    context text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: activity_guidelines_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.activity_guidelines_view AS
 SELECT entity_relations.source_entity_id AS activity_entity_id,
    entity_relations.target_entity_id AS guideline_entity_id
   FROM public.entity_relations
  WHERE (((entity_relations.relation_type)::text = 'follows'::text) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.source_entity_id) AND (entities.type = 'activity'::public.entity_type)))) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.target_entity_id) AND (entities.type = 'guideline'::public.entity_type)))));


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    audit_id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    table_name character varying(255) NOT NULL,
    record_id uuid NOT NULL,
    operation character(1) NOT NULL,
    old_data jsonb,
    new_data jsonb,
    changed_by uuid,
    changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT audit_log_operation_check CHECK ((operation = ANY (ARRAY['I'::bpchar, 'U'::bpchar, 'D'::bpchar])))
);


--
-- Name: block_attributes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.block_attributes (
    attribute_id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    block_id uuid NOT NULL,
    key character varying(255) NOT NULL,
    value text NOT NULL
);


--
-- Name: block_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.block_relationships (
    relationship_id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    source_block_id uuid NOT NULL,
    target_block_id uuid NOT NULL,
    relationship_type character varying(50) NOT NULL
);


--
-- Name: blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocks (
    block_id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    block_cid text NOT NULL,
    type public.block_type NOT NULL,
    content text,
    user_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    embedding public.vector(1536),
    search_vector tsvector,
    position_start_line integer,
    position_start_character integer,
    position_end_line integer,
    position_end_character integer,
    CONSTRAINT check_updated_at CHECK (((updated_at IS NULL) OR (updated_at >= created_at)))
);


--
-- Name: change_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.change_requests (
    change_request_id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    status public.change_request_status_type DEFAULT 'Draft'::public.change_request_status_type NOT NULL,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    target_branch text NOT NULL,
    feature_branch text NOT NULL,
    github_pr_url text,
    github_pr_number integer,
    github_repo text,
    thread_id uuid,
    merged_at timestamp with time zone,
    closed_at timestamp with time zone,
    merge_commit_hash text,
    CONSTRAINT check_change_requests_closed_at CHECK (((closed_at IS NULL) OR (closed_at >= created_at))),
    CONSTRAINT check_change_requests_merged_at CHECK (((merged_at IS NULL) OR (merged_at >= created_at))),
    CONSTRAINT check_change_requests_updated_at CHECK ((updated_at >= created_at))
);


--
-- Name: database_table_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.database_table_items (
    entity_id uuid NOT NULL,
    database_table_id uuid NOT NULL,
    field_values jsonb NOT NULL
);


--
-- Name: database_table_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.database_table_tags (
    database_table_id uuid NOT NULL,
    tag_id uuid NOT NULL
);


--
-- Name: database_table_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.database_table_views (
    entity_id uuid NOT NULL,
    view_name character varying(255) NOT NULL,
    view_description text,
    database_table_name character varying(255) NOT NULL,
    database_table_entity_id uuid NOT NULL,
    table_state jsonb
);


--
-- Name: database_tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.database_tables (
    entity_id uuid NOT NULL,
    table_name character varying(255) NOT NULL,
    table_description text,
    fields jsonb NOT NULL
);


--
-- Name: digital_item_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.digital_item_tags (
    digital_item_id uuid NOT NULL,
    tag_id uuid NOT NULL
);


--
-- Name: digital_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.digital_items (
    entity_id uuid NOT NULL,
    file_mime_type character varying(255),
    file_uri character varying(500),
    file_size character varying(50),
    file_cid character varying(100),
    text text,
    html text,
    search_vector tsvector
);


--
-- Name: entity_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_blocks (
    entity_id uuid NOT NULL,
    block_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: entity_hierarchies_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.entity_hierarchies_view AS
 SELECT entity_relations.source_entity_id AS parent_entity_id,
    entity_relations.target_entity_id AS child_entity_id
   FROM public.entity_relations
  WHERE ((entity_relations.relation_type)::text = ANY (ARRAY[('parent_of'::character varying)::text, ('contains'::character varying)::text]));


--
-- Name: entity_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_metadata (
    metadata_id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    entity_id uuid NOT NULL,
    key character varying(100) NOT NULL,
    value text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_updated_at CHECK (((updated_at IS NULL) OR (updated_at >= created_at)))
);


--
-- Name: entity_observations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_observations (
    observation_id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    entity_id uuid NOT NULL,
    category character varying(50) NOT NULL,
    content text NOT NULL,
    context text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: entity_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_tags (
    entity_id uuid NOT NULL,
    tag_entity_id uuid NOT NULL
);


--
-- Name: entity_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.entity_stats AS
 SELECT e.entity_id,
    e.title,
    e.type,
    count(DISTINCT r.relation_id) AS relation_count,
    count(DISTINCT o.observation_id) AS observation_count,
    count(DISTINCT et.tag_entity_id) AS tag_count,
    count(DISTINCT m.metadata_id) AS metadata_count,
    e.created_at,
    e.updated_at
   FROM ((((public.entities e
     LEFT JOIN public.entity_relations r ON ((e.entity_id = r.source_entity_id)))
     LEFT JOIN public.entity_observations o ON ((e.entity_id = o.entity_id)))
     LEFT JOIN public.entity_tags et ON ((e.entity_id = et.entity_id)))
     LEFT JOIN public.entity_metadata m ON ((e.entity_id = m.entity_id)))
  WHERE (e.archived_at IS NULL)
  GROUP BY e.entity_id, e.title, e.type, e.created_at, e.updated_at;


--
-- Name: external_syncs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_sync_records (
    sync_id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    entity_id uuid NOT NULL,
    external_system character varying(50) NOT NULL,
    external_id character varying(255) NOT NULL,
    last_synced_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_external_update_at timestamp without time zone,
    last_internal_update_at timestamp without time zone,
    field_last_updated jsonb,
    sync_status character varying(50) DEFAULT 'synced'::character varying
);


--
-- Name: guidelines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guidelines (
    entity_id uuid NOT NULL,
    guideline_status public.guideline_status_type,
    effective_date timestamp without time zone,
    globs jsonb DEFAULT '[]'::jsonb,
    always_apply boolean DEFAULT false
);


--
-- Name: COLUMN guidelines.globs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guidelines.globs IS 'Glob patterns for files that this guideline applies to';


--
-- Name: COLUMN guidelines.always_apply; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guidelines.always_apply IS 'Whether this guideline should always be applied';


--
-- Name: guideline_with_activities; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.guideline_with_activities AS
 SELECT g.entity_id,
    e.title,
    e.description,
    g.guideline_status,
    g.effective_date,
    array_agg(DISTINCT r.source_entity_id) AS activity_entity_ids,
    array_agg(DISTINCT ae.title) AS activity_titles
   FROM (((public.guidelines g
     JOIN public.entities e ON ((g.entity_id = e.entity_id)))
     LEFT JOIN public.entity_relations r ON (((g.entity_id = r.target_entity_id) AND ((r.relation_type)::text = 'follows'::text))))
     LEFT JOIN public.entities ae ON (((r.source_entity_id = ae.entity_id) AND (ae.type = 'activity'::public.entity_type))))
  WHERE (e.archived_at IS NULL)
  GROUP BY g.entity_id, e.title, e.description, g.guideline_status, g.effective_date;


--
-- Name: organization_members_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.organization_members_view AS
 SELECT entity_relations.source_entity_id AS organization_id,
    entity_relations.target_entity_id AS person_id
   FROM public.entity_relations
  WHERE (((entity_relations.relation_type)::text = 'has_member'::text) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.source_entity_id) AND (entities.type = 'organization'::public.entity_type)))) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.target_entity_id) AND (entities.type = 'person'::public.entity_type)))));


--
-- Name: organization_persons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_persons (
    person_id uuid NOT NULL,
    organization_id uuid NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    entity_id uuid NOT NULL,
    website_url character varying(255)
);


--
-- Name: person_organizations_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.person_organizations_view AS
 SELECT entity_relations.source_entity_id AS person_id,
    entity_relations.target_entity_id AS organization_id
   FROM public.entity_relations
  WHERE (((entity_relations.relation_type)::text = 'member_of'::text) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.source_entity_id) AND (entities.type = 'person'::public.entity_type)))) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.target_entity_id) AND (entities.type = 'organization'::public.entity_type)))));


--
-- Name: persons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.persons (
    entity_id uuid NOT NULL,
    first_name character varying(255) NOT NULL,
    last_name character varying(255) NOT NULL,
    email character varying(255),
    mobile_phone character varying(255),
    website_url character varying(255)
);


--
-- Name: physical_item_child_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.physical_item_child_items (
    parent_item_id uuid NOT NULL,
    child_item_id uuid NOT NULL
);


--
-- Name: physical_item_hierarchy_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.physical_item_hierarchy_view AS
 SELECT entity_relations.source_entity_id AS parent_item_id,
    entity_relations.target_entity_id AS child_item_id
   FROM public.entity_relations
  WHERE (((entity_relations.relation_type)::text = ANY (ARRAY[('contains'::character varying)::text, ('parent_of'::character varying)::text])) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.source_entity_id) AND (entities.type = 'physical_item'::public.entity_type)))) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.target_entity_id) AND (entities.type = 'physical_item'::public.entity_type)))));


--
-- Name: physical_item_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.physical_item_tags (
    physical_item_id uuid NOT NULL,
    tag_id uuid NOT NULL
);


--
-- Name: physical_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.physical_items (
    entity_id uuid NOT NULL,
    serial_number character varying(255),
    model_number character varying(255),
    manufacturer character varying(255),
    storage_location character varying(255),
    acquisition_date date,
    target_location character varying(255),
    current_location character varying(255),
    home_areas text[],
    home_attribute text[],
    activities text[],
    importance public.importance_type,
    frequency_of_use public.frequency_type,
    height_inches numeric(10,2),
    width_inches numeric(10,2),
    depth_inches numeric(10,2),
    weight_ounces numeric(10,2),
    volume_cubic_inches numeric(10,2),
    voltage character varying(20),
    wattage numeric(10,2),
    outlets_used integer,
    water_connection boolean,
    drain_connection boolean,
    ethernet_connected boolean,
    min_storage_temperature_celsius numeric(5,2),
    max_storage_temperature_celsius numeric(5,2),
    min_storage_humidity_percent numeric(5,2),
    max_storage_humidity_percent numeric(5,2),
    exist boolean,
    current_quantity integer,
    target_quantity integer,
    consumable boolean,
    perishable boolean,
    kit_name character varying(255),
    kit_items text[],
    large_drawer_units integer,
    standard_drawer_units integer,
    storage_notes text,
    misc_notes text
);


--
-- Name: physical_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.physical_locations (
    entity_id uuid NOT NULL,
    latitude numeric(10,8),
    longitude numeric(11,8),
    mail_address text,
    mail_address2 text,
    mail_careof text,
    mail_street_number text,
    mail_street_prefix text,
    mail_street_name text,
    mail_street_type text,
    mail_street_suffix text,
    mail_unit_number text,
    mail_city text,
    mail_state text,
    mail_zip text,
    mail_country text,
    mail_urbanization text
);


--
-- Name: sync_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_configs (
    config_id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    entity_id uuid,
    entity_type public.entity_type,
    external_system character varying(50) NOT NULL,
    field_strategies jsonb NOT NULL,
    CONSTRAINT sync_configs_check CHECK (((entity_id IS NOT NULL) OR (entity_type IS NOT NULL)))
);


--
-- Name: sync_conflicts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_conflicts (
    conflict_id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    sync_id uuid NOT NULL,
    import_cid text NOT NULL,
    conflicts jsonb NOT NULL,
    resolutions jsonb,
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    resolved_at timestamp without time zone,
    resolved_by uuid
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    entity_id uuid NOT NULL,
    color character varying(50)
);


--
-- Name: task_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_activities (
    activity_id uuid NOT NULL,
    task_id uuid NOT NULL
);


--
-- Name: task_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_dependencies (
    task_id uuid NOT NULL,
    dependent_task_id uuid NOT NULL
);


--
-- Name: task_dependencies_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.task_dependencies_view AS
 SELECT entity_relations.source_entity_id AS task_entity_id,
    entity_relations.target_entity_id AS dependent_task_entity_id
   FROM public.entity_relations
  WHERE (((entity_relations.relation_type)::text = 'depends_on'::text) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.source_entity_id) AND (entities.type = 'task'::public.entity_type)))) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.target_entity_id) AND (entities.type = 'task'::public.entity_type)))));


--
-- Name: task_digital_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_digital_items (
    digital_item_id uuid NOT NULL,
    task_id uuid NOT NULL
);


--
-- Name: task_digital_items_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.task_digital_items_view AS
 SELECT entity_relations.source_entity_id AS task_id,
    entity_relations.target_entity_id AS digital_item_id
   FROM public.entity_relations
  WHERE (((entity_relations.relation_type)::text = 'requires'::text) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.source_entity_id) AND (entities.type = 'task'::public.entity_type)))) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.target_entity_id) AND (entities.type = 'digital_item'::public.entity_type)))));


--
-- Name: task_organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_organizations (
    organization_id uuid NOT NULL,
    task_id uuid NOT NULL
);


--
-- Name: task_organizations_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.task_organizations_view AS
 SELECT entity_relations.source_entity_id AS task_id,
    entity_relations.target_entity_id AS organization_id
   FROM public.entity_relations
  WHERE (((entity_relations.relation_type)::text = ANY (ARRAY[('assigned_to'::character varying)::text, ('involves'::character varying)::text])) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.source_entity_id) AND (entities.type = 'task'::public.entity_type)))) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.target_entity_id) AND (entities.type = 'organization'::public.entity_type)))));


--
-- Name: task_parent_child_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.task_parent_child_view AS
 SELECT entity_relations.target_entity_id AS parent_task_id,
    entity_relations.source_entity_id AS child_task_id
   FROM public.entity_relations
  WHERE (((entity_relations.relation_type)::text = 'child_of'::text) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.source_entity_id) AND (entities.type = 'task'::public.entity_type)))) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.target_entity_id) AND (entities.type = 'task'::public.entity_type)))));


--
-- Name: task_parents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_parents (
    parent_task_id uuid NOT NULL,
    child_task_id uuid NOT NULL
);


--
-- Name: task_persons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_persons (
    person_id uuid NOT NULL,
    task_id uuid NOT NULL
);


--
-- Name: task_persons_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.task_persons_view AS
 SELECT entity_relations.source_entity_id AS task_id,
    entity_relations.target_entity_id AS person_id
   FROM public.entity_relations
  WHERE (((entity_relations.relation_type)::text = ANY (ARRAY[('assigned_to'::character varying)::text, ('involves'::character varying)::text])) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.source_entity_id) AND (entities.type = 'task'::public.entity_type)))) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.target_entity_id) AND (entities.type = 'person'::public.entity_type)))));


--
-- Name: task_physical_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_physical_items (
    physical_item_id uuid NOT NULL,
    task_id uuid NOT NULL
);


--
-- Name: task_physical_items_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.task_physical_items_view AS
 SELECT entity_relations.source_entity_id AS task_id,
    entity_relations.target_entity_id AS physical_item_id
   FROM public.entity_relations
  WHERE (((entity_relations.relation_type)::text = 'requires'::text) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.source_entity_id) AND (entities.type = 'task'::public.entity_type)))) AND (EXISTS ( SELECT 1
           FROM public.entities
          WHERE ((entities.entity_id = entity_relations.target_entity_id) AND (entities.type = 'physical_item'::public.entity_type)))));


--
-- Name: task_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_tags (
    task_id uuid NOT NULL,
    tag_id uuid NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    entity_id uuid NOT NULL,
    status public.task_status_type DEFAULT 'No status'::public.task_status_type,
    priority public.priority_type,
    assigned_to character varying(255),
    start_by timestamp without time zone,
    finish_by timestamp without time zone,
    estimated_total_duration integer,
    estimated_preparation_duration integer,
    estimated_execution_duration integer,
    estimated_cleanup_duration integer,
    actual_duration integer,
    planned_start timestamp without time zone,
    planned_finish timestamp without time zone,
    started_at timestamp without time zone,
    finished_at timestamp without time zone,
    snooze_until timestamp without time zone,
    CONSTRAINT check_estimated_duration CHECK (((estimated_total_duration IS NULL) OR (estimated_total_duration >= ((COALESCE(estimated_preparation_duration, 0) + COALESCE(estimated_execution_duration, 0)) + COALESCE(estimated_cleanup_duration, 0)))))
);


--
-- Name: text_document_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.text_document_view AS
 SELECT entities.entity_id,
    entities.title,
    entities.type,
    entities.permalink,
    entities.description,
    entities.user_id,
    entities.embedding,
    entities.git_sha,
    entities.content,
    entities.markdown,
    entities.frontmatter,
    entities.absolute_path AS file_path,
    entities.created_at,
    entities.updated_at
   FROM public.entities
  WHERE ((entities.archived_at IS NULL) AND (entities.type = 'text'::public.entity_type));


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    user_id uuid DEFAULT public.uuid_generate_v1() NOT NULL,
    public_key character varying(64) NOT NULL,
    username character varying(255) NOT NULL,
    email character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_updated_at CHECK (((updated_at IS NULL) OR (updated_at >= created_at)))
);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (entity_id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (audit_id);


--
-- Name: block_attributes block_attributes_block_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_attributes
    ADD CONSTRAINT block_attributes_block_id_key_key UNIQUE (block_id, key);


--
-- Name: block_attributes block_attributes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_attributes
    ADD CONSTRAINT block_attributes_pkey PRIMARY KEY (attribute_id);


--
-- Name: block_relationships block_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_relationships
    ADD CONSTRAINT block_relationships_pkey PRIMARY KEY (relationship_id);


--
-- Name: block_relationships block_relationships_source_block_id_target_block_id_relatio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_relationships
    ADD CONSTRAINT block_relationships_source_block_id_target_block_id_relatio_key UNIQUE (source_block_id, target_block_id, relationship_type);


--
-- Name: blocks blocks_block_cid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_block_cid_key UNIQUE (block_cid);


--
-- Name: blocks blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (block_id);


--
-- Name: change_requests change_requests_feature_branch_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_requests
    ADD CONSTRAINT change_requests_feature_branch_key UNIQUE (feature_branch);


--
-- Name: change_requests change_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_requests
    ADD CONSTRAINT change_requests_pkey PRIMARY KEY (change_request_id);


--
-- Name: database_table_items database_table_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_table_items
    ADD CONSTRAINT database_table_items_pkey PRIMARY KEY (entity_id);


--
-- Name: database_table_tags database_table_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_table_tags
    ADD CONSTRAINT database_table_tags_pkey PRIMARY KEY (database_table_id, tag_id);


--
-- Name: database_table_views database_table_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_table_views
    ADD CONSTRAINT database_table_views_pkey PRIMARY KEY (entity_id);


--
-- Name: database_table_views database_table_views_view_name_entity_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_table_views
    ADD CONSTRAINT database_table_views_view_name_entity_id_key UNIQUE (view_name, entity_id);


--
-- Name: database_tables database_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_tables
    ADD CONSTRAINT database_tables_pkey PRIMARY KEY (entity_id);


--
-- Name: database_tables database_tables_table_name_entity_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_tables
    ADD CONSTRAINT database_tables_table_name_entity_id_key UNIQUE (table_name, entity_id);


--
-- Name: digital_item_tags digital_item_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_item_tags
    ADD CONSTRAINT digital_item_tags_pkey PRIMARY KEY (digital_item_id, tag_id);


--
-- Name: digital_items digital_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_items
    ADD CONSTRAINT digital_items_pkey PRIMARY KEY (entity_id);


--
-- Name: entities entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_pkey PRIMARY KEY (entity_id);


--
-- Name: entity_blocks entity_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_blocks
    ADD CONSTRAINT entity_blocks_pkey PRIMARY KEY (entity_id, block_id);


--
-- Name: entity_metadata entity_metadata_entity_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_metadata
    ADD CONSTRAINT entity_metadata_entity_id_key_key UNIQUE (entity_id, key);


--
-- Name: entity_metadata entity_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_metadata
    ADD CONSTRAINT entity_metadata_pkey PRIMARY KEY (metadata_id);


--
-- Name: entity_observations entity_observations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_observations
    ADD CONSTRAINT entity_observations_pkey PRIMARY KEY (observation_id);


--
-- Name: entity_relations entity_relations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_relations
    ADD CONSTRAINT entity_relations_pkey PRIMARY KEY (relation_id);


--
-- Name: entity_tags entity_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_tags
    ADD CONSTRAINT entity_tags_pkey PRIMARY KEY (entity_id, tag_entity_id);


--
-- Name: external_syncs external_syncs_entity_id_external_system_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_sync_records
    ADD CONSTRAINT entity_sync_records_entity_id_external_system_external_id_key UNIQUE (entity_id, external_system, external_id);


--
-- Name: external_syncs external_syncs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_sync_records
    ADD CONSTRAINT entity_sync_records_pkey PRIMARY KEY (sync_id);


--
-- Name: guidelines guidelines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guidelines
    ADD CONSTRAINT guidelines_pkey PRIMARY KEY (entity_id);


--
-- Name: organization_persons organization_persons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_persons
    ADD CONSTRAINT organization_persons_pkey PRIMARY KEY (person_id, organization_id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (entity_id);


--
-- Name: persons persons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persons
    ADD CONSTRAINT persons_pkey PRIMARY KEY (entity_id);


--
-- Name: physical_item_child_items physical_item_child_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.physical_item_child_items
    ADD CONSTRAINT physical_item_child_items_pkey PRIMARY KEY (parent_item_id, child_item_id);


--
-- Name: physical_item_tags physical_item_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.physical_item_tags
    ADD CONSTRAINT physical_item_tags_pkey PRIMARY KEY (physical_item_id, tag_id);


--
-- Name: physical_items physical_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.physical_items
    ADD CONSTRAINT physical_items_pkey PRIMARY KEY (entity_id);


--
-- Name: physical_locations physical_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.physical_locations
    ADD CONSTRAINT physical_locations_pkey PRIMARY KEY (entity_id);


--
-- Name: sync_configs sync_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_configs
    ADD CONSTRAINT sync_configs_pkey PRIMARY KEY (config_id);


--
-- Name: sync_conflicts sync_conflicts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_conflicts
    ADD CONSTRAINT sync_conflicts_pkey PRIMARY KEY (conflict_id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (entity_id);


--
-- Name: task_activities task_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_activities
    ADD CONSTRAINT task_activities_pkey PRIMARY KEY (activity_id, task_id);


--
-- Name: task_dependencies task_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_pkey PRIMARY KEY (task_id, dependent_task_id);


--
-- Name: task_digital_items task_digital_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_digital_items
    ADD CONSTRAINT task_digital_items_pkey PRIMARY KEY (digital_item_id, task_id);


--
-- Name: task_organizations task_organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_organizations
    ADD CONSTRAINT task_organizations_pkey PRIMARY KEY (organization_id, task_id);


--
-- Name: task_parents task_parents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_parents
    ADD CONSTRAINT task_parents_pkey PRIMARY KEY (parent_task_id, child_task_id);


--
-- Name: task_persons task_persons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_persons
    ADD CONSTRAINT task_persons_pkey PRIMARY KEY (person_id, task_id);


--
-- Name: task_physical_items task_physical_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_physical_items
    ADD CONSTRAINT task_physical_items_pkey PRIMARY KEY (physical_item_id, task_id);


--
-- Name: task_tags task_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT task_tags_pkey PRIMARY KEY (task_id, tag_id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (entity_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: users users_public_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_public_key_key UNIQUE (public_key);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_activities_view_entity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_activities_view_entity_id ON public.activities_view USING btree (entity_id);


--
-- Name: idx_audit_log_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_changed_at ON public.audit_log USING btree (changed_at DESC);


--
-- Name: idx_audit_log_table_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_table_record ON public.audit_log USING btree (table_name, record_id);


--
-- Name: idx_block_relationships_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_block_relationships_source ON public.block_relationships USING btree (source_block_id);


--
-- Name: idx_block_relationships_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_block_relationships_target ON public.block_relationships USING btree (target_block_id);


--
-- Name: idx_block_relationships_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_block_relationships_type ON public.block_relationships USING btree (relationship_type);


--
-- Name: idx_blocks_block_cid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_block_cid ON public.blocks USING btree (block_cid);


--
-- Name: idx_blocks_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_created_at ON public.blocks USING btree (created_at DESC);


--
-- Name: idx_blocks_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_embedding ON public.blocks USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_blocks_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_search ON public.blocks USING gin (search_vector);


--
-- Name: idx_blocks_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_type ON public.blocks USING btree (type);


--
-- Name: idx_blocks_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_updated_at ON public.blocks USING btree (updated_at DESC);


--
-- Name: idx_blocks_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_user_id ON public.blocks USING btree (user_id);


--
-- Name: idx_change_requests_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_change_requests_created_at ON public.change_requests USING btree (created_at DESC);


--
-- Name: idx_change_requests_github_pr_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_change_requests_github_pr_number ON public.change_requests USING btree (github_pr_number) WHERE (github_pr_number IS NOT NULL);


--
-- Name: idx_change_requests_github_repo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_change_requests_github_repo ON public.change_requests USING btree (github_repo);


--
-- Name: idx_change_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_change_requests_status ON public.change_requests USING btree (status);


--
-- Name: idx_change_requests_target_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_change_requests_target_branch ON public.change_requests USING btree (target_branch);


--
-- Name: idx_change_requests_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_change_requests_updated_at ON public.change_requests USING btree (updated_at DESC);


--
-- Name: idx_database_items_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_database_items_parent ON public.database_table_items USING btree (database_table_id);


--
-- Name: idx_digital_items_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_digital_items_search ON public.digital_items USING gin (search_vector);


--
-- Name: idx_entities_archived_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entities_archived_at ON public.entities USING btree (archived_at);


--
-- Name: idx_entities_content_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entities_content_gin ON public.entities USING gin (to_tsvector('english'::regconfig, content)) WHERE (type = 'text'::public.entity_type);


--
-- Name: idx_entities_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entities_created_at ON public.entities USING btree (created_at DESC);


--
-- Name: idx_entities_description_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entities_description_gin ON public.entities USING gin (to_tsvector('english'::regconfig, description)) WHERE (description IS NOT NULL);


--
-- Name: idx_entities_file_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entities_file_path ON public.entities USING btree (absolute_path) WHERE (type = 'text'::public.entity_type);


--
-- Name: idx_entities_file_path_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_entities_file_path_user ON public.entities USING btree (absolute_path, user_id) WHERE ((type = 'text'::public.entity_type) AND (absolute_path IS NOT NULL));


--
-- Name: idx_entities_frontmatter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entities_frontmatter ON public.entities USING gin (frontmatter) WHERE (type = 'text'::public.entity_type);


--
-- Name: idx_entities_git_sha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entities_git_sha ON public.entities USING btree (git_sha);


--
-- Name: idx_entities_markdown_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entities_markdown_gin ON public.entities USING gin (to_tsvector('english'::regconfig, markdown)) WHERE (type = 'text'::public.entity_type);


--
-- Name: idx_entities_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entities_type ON public.entities USING btree (type);


--
-- Name: idx_entities_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entities_updated_at ON public.entities USING btree (updated_at DESC);


--
-- Name: idx_entities_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entities_user_id ON public.entities USING btree (user_id);


--
-- Name: idx_entity_blocks_block_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_blocks_block_id ON public.entity_blocks USING btree (block_id);


--
-- Name: idx_entity_blocks_entity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_blocks_entity_id ON public.entity_blocks USING btree (entity_id);


--
-- Name: idx_entity_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_embedding ON public.entities USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_entity_metadata_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_metadata_key ON public.entity_metadata USING btree (key);


--
-- Name: idx_entity_observations_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_observations_category ON public.entity_observations USING btree (category);


--
-- Name: idx_entity_relations_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_relations_source ON public.entity_relations USING btree (source_entity_id);


--
-- Name: idx_entity_relations_source_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_relations_source_type ON public.entity_relations USING btree (source_entity_id, relation_type);


--
-- Name: idx_entity_relations_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_relations_target ON public.entity_relations USING btree (target_entity_id);


--
-- Name: idx_entity_relations_target_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_relations_target_type ON public.entity_relations USING btree (target_entity_id, relation_type);


--
-- Name: idx_entity_relations_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_relations_type ON public.entity_relations USING btree (relation_type);


--
-- Name: idx_entity_tags_tag_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_tags_tag_id ON public.entity_tags USING btree (tag_entity_id);


--
-- Name: idx_external_syncs_entity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_sync_records_entity_id ON public.entity_sync_records USING btree (entity_id);


--
-- Name: idx_external_syncs_external; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_sync_records_external ON public.entity_sync_records USING btree (external_system, external_id);


--
-- Name: idx_guideline_effective_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guideline_effective_date ON public.guidelines USING btree (effective_date);


--
-- Name: idx_guideline_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guideline_status ON public.guidelines USING btree (guideline_status);


--
-- Name: idx_physical_location_coordinates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_physical_location_coordinates ON public.physical_locations USING btree (latitude, longitude);


--
-- Name: idx_sync_configs_entity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_configs_entity_id ON public.sync_configs USING btree (entity_id);


--
-- Name: idx_sync_configs_entity_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_configs_entity_type ON public.sync_configs USING btree (entity_type);


--
-- Name: idx_sync_conflicts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_conflicts_status ON public.sync_conflicts USING btree (status);


--
-- Name: idx_sync_conflicts_sync_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_conflicts_sync_id ON public.sync_conflicts USING btree (sync_id);


--
-- Name: idx_tasks_finish_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_finish_by ON public.tasks USING btree (finish_by);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);


--
-- Name: idx_unique_entity_relations; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_unique_entity_relations ON public.entity_relations USING btree (source_entity_id, target_entity_id, relation_type);


--
-- Name: idx_unique_tag_entities; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_unique_tag_entities ON public.entities USING btree (title, user_id) WHERE (type = 'tag'::public.entity_type);


--
-- Name: entities entities_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER entities_audit AFTER INSERT OR DELETE OR UPDATE ON public.entities FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();


--
-- Name: entity_blocks entity_blocks_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER entity_blocks_audit AFTER INSERT OR DELETE OR UPDATE ON public.entity_blocks FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();


--
-- Name: entities refresh_activities_view_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER refresh_activities_view_trigger AFTER INSERT OR DELETE OR UPDATE ON public.entities FOR EACH ROW EXECUTE FUNCTION public.refresh_activities_view();


--
-- Name: blocks trigger_update_block_search_vector; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_block_search_vector BEFORE INSERT OR UPDATE ON public.blocks FOR EACH ROW EXECUTE FUNCTION public.update_block_search_vector();


--
-- Name: digital_items trigger_update_digital_items_search_vector; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_digital_items_search_vector BEFORE INSERT OR UPDATE ON public.digital_items FOR EACH ROW EXECUTE FUNCTION public.update_digital_items_search_vector();


--
-- Name: activities activities_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: block_attributes block_attributes_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_attributes
    ADD CONSTRAINT block_attributes_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(block_id) ON DELETE CASCADE;


--
-- Name: block_relationships block_relationships_source_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_relationships
    ADD CONSTRAINT block_relationships_source_block_id_fkey FOREIGN KEY (source_block_id) REFERENCES public.blocks(block_id) ON DELETE CASCADE;


--
-- Name: block_relationships block_relationships_target_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_relationships
    ADD CONSTRAINT block_relationships_target_block_id_fkey FOREIGN KEY (target_block_id) REFERENCES public.blocks(block_id) ON DELETE CASCADE;


--
-- Name: blocks blocks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: database_table_items database_table_items_database_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_table_items
    ADD CONSTRAINT database_table_items_database_table_id_fkey FOREIGN KEY (database_table_id) REFERENCES public.database_tables(entity_id) ON DELETE CASCADE;


--
-- Name: database_table_items database_table_items_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_table_items
    ADD CONSTRAINT database_table_items_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: database_table_views database_table_views_database_table_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_table_views
    ADD CONSTRAINT database_table_views_database_table_entity_id_fkey FOREIGN KEY (database_table_entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: database_table_views database_table_views_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_table_views
    ADD CONSTRAINT database_table_views_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: database_tables database_tables_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_tables
    ADD CONSTRAINT database_tables_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: digital_items digital_items_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_items
    ADD CONSTRAINT digital_items_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: entities entities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: entity_blocks entity_blocks_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_blocks
    ADD CONSTRAINT entity_blocks_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(block_id) ON DELETE CASCADE;


--
-- Name: entity_blocks entity_blocks_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_blocks
    ADD CONSTRAINT entity_blocks_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: entity_metadata entity_metadata_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_metadata
    ADD CONSTRAINT entity_metadata_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: entity_observations entity_observations_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_observations
    ADD CONSTRAINT entity_observations_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: entity_relations entity_relations_source_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_relations
    ADD CONSTRAINT entity_relations_source_entity_id_fkey FOREIGN KEY (source_entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: entity_relations entity_relations_target_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_relations
    ADD CONSTRAINT entity_relations_target_entity_id_fkey FOREIGN KEY (target_entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: entity_tags entity_tags_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_tags
    ADD CONSTRAINT entity_tags_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: entity_tags entity_tags_tag_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_tags
    ADD CONSTRAINT entity_tags_tag_entity_id_fkey FOREIGN KEY (tag_entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: guidelines guidelines_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guidelines
    ADD CONSTRAINT guidelines_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: organizations organizations_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: persons persons_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persons
    ADD CONSTRAINT persons_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: physical_items physical_items_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.physical_items
    ADD CONSTRAINT physical_items_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: physical_locations physical_locations_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.physical_locations
    ADD CONSTRAINT physical_locations_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: sync_configs sync_configs_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_configs
    ADD CONSTRAINT sync_configs_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: sync_conflicts sync_conflicts_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_conflicts
    ADD CONSTRAINT sync_conflicts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(user_id);


--
-- Name: sync_conflicts sync_conflicts_sync_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_conflicts
    ADD CONSTRAINT sync_conflicts_sync_id_fkey FOREIGN KEY (sync_id) REFERENCES public.entity_sync_records(sync_id) ON DELETE CASCADE;


--
-- Name: tags tags_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- Name: tasks tasks_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(entity_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

