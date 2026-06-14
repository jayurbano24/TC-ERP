import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employee.findMany({
    orderBy: { createdAt: 'asc' }
  });

  console.log(`Found ${employees.length} employees to renumber...`);
  
  for (let i = 0; i < employees.length; i++) {
    const newCode = `EMP-${(i + 1).toString().padStart(4, '0')}`;
    await prisma.employee.update({
      where: { id: employees[i].id },
      data: { codigoEmpleado: newCode }
    });
    console.log(`Updated ${employees[i].nombreCompleto} -> ${newCode}`);
  }
  
  console.log('Done!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
