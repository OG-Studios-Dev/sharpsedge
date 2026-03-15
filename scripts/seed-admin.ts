const instructions = [
  "Sign up `marcodgrossi@gmail.com` in the app with password `Temp123`.",
  "Then run this SQL in the Supabase SQL editor:",
  "",
  "update public.profiles set role = 'admin' where username = 'marco';",
].join("\n");

console.log(instructions);
