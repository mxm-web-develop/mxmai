import { redirect } from 'next/navigation';

export default async function ServiceSlugRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/create/${slug}`);
}
