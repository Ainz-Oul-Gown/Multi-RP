// Type declarations for Deno runtime in Supabase Edge Functions

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

declare module "https://*" {
  const content: any;
  export default content;
  export const serve: any;
  export const createClient: any;
}
