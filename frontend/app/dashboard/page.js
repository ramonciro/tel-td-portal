useEffect(() => {
  async function carregar() {
    try {
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      if (!token) {
        setErro("Token não encontrado. Faça login novamente.");
        return;
      }

      const res = await fetch(`${apiUrl}/dashboard`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const texto = await res.text();

      if (!res.ok) {
        setErro(`Erro ao carregar dashboard: ${texto}`);
        return;
      }

      const json = JSON.parse(texto);
      setDados(json);
    } catch (e) {
      setErro(`Erro ao carregar dashboard: ${e.message}`);
    }
  }

  carregar();
}, []);
