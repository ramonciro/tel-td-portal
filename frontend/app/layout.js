export const metadata = {
  title:"Tel T&D",
  description:"Portal de Treinamento e Desenvolvimento"
};

export default function RootLayout({children}){
  return (
    <html lang="pt-BR">
    <body>{children}</body>
    </html>
  );
}
