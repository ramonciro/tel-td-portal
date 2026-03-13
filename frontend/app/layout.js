export const metadata = { title: "Tel T&D", description: "Portal de Treinamento e Desenvolvimento" }
export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "Inter, Arial, sans-serif", background: "#f1f5f9" }}>
        {children}
      </body>
    </html>
  )
}
