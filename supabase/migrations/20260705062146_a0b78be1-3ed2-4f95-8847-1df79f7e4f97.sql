
CREATE POLICY "Staff read followup-media"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'followup-media' AND public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff insert followup-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'followup-media' AND public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff update followup-media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'followup-media' AND public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff delete followup-media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'followup-media' AND public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff read inbound-media"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'inbound-media' AND public.is_staff_or_admin(auth.uid()));
