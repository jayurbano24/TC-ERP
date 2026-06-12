const url = 'https://gpvocfptmsskgfpacadl.supabase.co/rest/v1/?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwdm9jZnB0bXNza2dmcGFjYWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MDA3MDQsImV4cCI6MjA5Mjk3NjcwNH0.T6bdu3uVW4urmuey5rY16lhd7mHzqyUssv2dLBCR-vg';
fetch(url).then(r => r.json()).then(data => {
  const definitions = data.definitions || (data.components && data.components.schemas);
  if (definitions && definitions.audit_logs) {
    console.log(JSON.stringify(definitions.audit_logs, null, 2));
  } else {
    console.log(Object.keys(definitions || {}));
  }
}).catch(console.error);
