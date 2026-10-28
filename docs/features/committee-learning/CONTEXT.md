# Context — committee-learning

## Glossary

| Term | Meaning |
| --- | --- |
| CommitteeOperator | Persona con una sesión de invitación válida que solicita simulaciones privadas del modo Comité. |
| ReleaseOperator | Persona autorizada para habilitar infraestructura, verificar perfil y autorizar una publicación; no es un rol nuevo de la aplicación. |
| CommitteeJob | Búsqueda acotada y privada, propiedad de una sesión concreta, no del código de invitación compartido. |
| Scenario | Condiciones epidemiológicas ficticias, recursos, origen, semilla y horizonte comunes a todas las políticas comparadas. |
| PolicyWeights | Cuatro pesos logarítmicos de priorización de acciones; no son una red neuronal ni código ejecutable. |
| Incumbent | Última política cuya mejora fue validada; un empate conserva la anterior. |
| ProgressVersion | Resultado inmutable con evidencia de promoción local; todavía no implica aprobación de auditoría final. |
| FinalAudit | Única evaluación final con semillas no utilizadas para elegir candidatas. Puede rechazar una mejora progresiva. |
| PolicyLibrary | Hasta ocho vectores compatibles de uso interno compartido, sin propietarios, semillas ni historiales privados. |
| RunManifest | Versiones, configuración, semillas, biblioteca congelada, orden y hashes suficientes para reproducir un trabajo. |
| CumulativeInfections | Expuestos e infecciosos iniciales más nuevas transiciones de susceptible a expuesto; no muertes. |
| Trajectory | Una política, una réplica y un horizonte; no equivale a una búsqueda completa. |
| LearningBudget | Objetivo de diseño de 5 USD mensuales, no corte duro de la factura AWS. |
| HeldOutSeeds | Semillas no usadas en entrenamiento; su reutilización para elegir políticas impide llamarlas prueba final intacta. |

## Authority

Fuente brownfield: `4bcdc6e251c4ad02c350a15e35e3af1bb5e0ab5d`.
Las decisiones de producto aceptadas están en [idea brief](../../idea-brief.md).
Las decisiones técnicas de este paquete son supuestos explícitos del arquitecto,
autorizados para completar el plan; no se atribuyen al usuario. Los contratos
de este directorio prevalecen sobre ejemplos históricos de backend-demo.
