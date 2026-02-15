/*
  # Enable Realtime on Key Tables

  Adds jobs, processing_logs, and courses tables to the
  supabase_realtime publication so that the frontend can
  receive live updates during course processing.

  ## Changes
  - Add jobs, processing_logs, courses to realtime publication
*/

ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE processing_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE courses;
