import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const result = await prisma.$queryRaw`SELECT NOW()`;

    return Response.json({
      success: true,
      message: "Database connected successfully",
      time: result,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        success: false,
        message: "Database connection failed",
      },
      { status: 500 }
    );
  }
}