-- Cache the authenticated identity once per statement without changing ownership rules.
alter policy own_annotations on public.hikoro_annotations
 using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy own_shared_records on public.hikoro_shared_records
 using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
