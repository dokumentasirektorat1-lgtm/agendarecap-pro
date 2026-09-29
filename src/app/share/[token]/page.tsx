import PublicShareClient from "./PublicShareClient";

export function generateStaticParams() {
  return [{ token: 'placeholder' }];
}

export default async function PublicSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicShareClient token={token} />;
}
