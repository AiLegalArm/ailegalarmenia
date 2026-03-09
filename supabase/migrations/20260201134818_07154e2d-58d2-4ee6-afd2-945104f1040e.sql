-- Fix RLS for case_files (upload/delete) and harden storage.objects policies for case-files bucket

-- ==============================
-- case_files table policies
-- ==============================

-- Replace INSERT policy to include team leaders and ensure uploaded_by matches the current user (unless admin)
DROP POLICY IF EXISTS "Authenticated users can upload files to their cases" ON public.case_files;

CREATE POLICY "Case members can upload files"
ON public.case_files
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  (
    -- uploader must be current user (admins may upload on behalf)
    uploaded_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  AND (
    -- direct case access
    case_id IN (
      SELECT c.id
      FROM public.cases c
      WHERE c.lawyer_id = auth.uid()
         OR c.client_id = auth.uid()
    )
    OR (
      -- team leader access to team members' cases
      case_id IN (
        SELECT c.id
        FROM public.cases c
        WHERE c.lawyer_id IN (SELECT public.get_team_member_ids(auth.uid()))
      )
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Replace UPDATE policies with one policy that supports soft-delete for all case members (client/lawyer/team leader/admin)
DROP POLICY IF EXISTS "Clients can soft-delete files on their cases" ON public.case_files;
DROP POLICY IF EXISTS "Lawyers and admins can update files" ON public.case_files;

CREATE POLICY "Case members can update files"
ON public.case_files
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  case_id IN (
    SELECT c.id
    FROM public.cases c
    WHERE c.lawyer_id = auth.uid()
       OR c.client_id = auth.uid()
       OR c.lawyer_id IN (SELECT public.get_team_member_ids(auth.uid()))
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  case_id IN (
    SELECT c.id
    FROM public.cases c
    WHERE c.lawyer_id = auth.uid()
       OR c.client_id = auth.uid()
       OR c.lawyer_id IN (SELECT public.get_team_member_ids(auth.uid()))
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- ==============================
-- storage.objects policies (case-files bucket)
-- ==============================

-- Remove overly broad policies that allow any authenticated user to read/delete any object in bucket
DROP POLICY IF EXISTS "Authenticated users can upload case files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view case files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update case files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete case files" ON storage.objects;

-- Case files are stored as:
--   <caseId>/<uuid>.<ext>
-- or legacy:
--   case-<caseId>/<uuid>.<ext>
-- Complaint files are stored as:
--   <userId>/complaints/<...>
-- We MUST avoid matching complaints here.

CREATE POLICY "Case members can view case files"
ON storage.objects
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  bucket_id = 'case-files'
  AND split_part(name, '/', 2) <> 'complaints'
  AND EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.id::text = replace(split_part(name, '/', 1), 'case-', '')
      AND (
        c.lawyer_id = auth.uid()
        OR c.client_id = auth.uid()
        OR c.lawyer_id IN (SELECT public.get_team_member_ids(auth.uid()))
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

CREATE POLICY "Case members can upload case files"
ON storage.objects
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'case-files'
  AND split_part(name, '/', 2) <> 'complaints'
  AND EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.id::text = replace(split_part(name, '/', 1), 'case-', '')
      AND (
        c.lawyer_id = auth.uid()
        OR c.client_id = auth.uid()
        OR c.lawyer_id IN (SELECT public.get_team_member_ids(auth.uid()))
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

CREATE POLICY "Case members can update case files"
ON storage.objects
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'case-files'
  AND split_part(name, '/', 2) <> 'complaints'
  AND EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.id::text = replace(split_part(name, '/', 1), 'case-', '')
      AND (
        c.lawyer_id = auth.uid()
        OR c.client_id = auth.uid()
        OR c.lawyer_id IN (SELECT public.get_team_member_ids(auth.uid()))
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

CREATE POLICY "Case members can delete case files"
ON storage.objects
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
  bucket_id = 'case-files'
  AND split_part(name, '/', 2) <> 'complaints'
  AND EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.id::text = replace(split_part(name, '/', 1), 'case-', '')
      AND (
        c.lawyer_id = auth.uid()
        OR c.client_id = auth.uid()
        OR c.lawyer_id IN (SELECT public.get_team_member_ids(auth.uid()))
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  )
);
