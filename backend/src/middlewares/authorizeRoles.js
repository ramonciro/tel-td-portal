export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    try {
      const userRole = String(req.user?.perfil || "").toLowerCase();

      if (!userRole) {
        return res.status(401).json({ ok: false, message: "Perfil não identificado" });
      }

      const normalizedAllowed = allowedRoles.map((r) => String(r).toLowerCase());

      if (!normalizedAllowed.includes(userRole)) {
        return res.status(403).json({ ok: false, message: "Acesso não autorizado para este perfil" });
      }

      next();
    } catch (error) {
      return res.status(500).json({ ok: false, message: "Erro ao validar perfil", error: error.message });
    }
  };
}
