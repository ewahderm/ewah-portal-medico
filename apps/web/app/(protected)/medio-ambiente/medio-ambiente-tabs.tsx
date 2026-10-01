"use client";

import { ThermometerIcon, SnowflakeIcon, Trash2Icon, FlameIcon, SparklesIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemperaturaConsultorioTab } from "./temperatura-consultorio-tab";
import { TemperaturaNeveraTab } from "./temperatura-nevera-tab";
import { ResiduosTab } from "./residuos-tab";
import { ExtintoresTab } from "./extintores-tab";
import { LimpiezaTab } from "./limpieza-tab";
import type { Opcion } from "@/lib/forms/opciones";

type Consultorio = { id: string; nombre: string; sede_id: string };
type Nevera = { id: string; nombre: string; sede_id: string };

export function MedioAmbienteTabs({
  sedes,
  consultorios,
  neveras,
  tiposExtintor,
  puedeCrear,
  puedeEditar,
  nombreUsuario,
}: {
  sedes: Opcion[];
  consultorios: Consultorio[];
  neveras: Nevera[];
  tiposExtintor: Opcion[];
  puedeCrear: boolean;
  puedeEditar: boolean;
  nombreUsuario: string;
}) {
  return (
    <Tabs defaultValue="temperatura">
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger value="temperatura">
          <ThermometerIcon /> Temperatura y Humedad
        </TabsTrigger>
        <TabsTrigger value="neveras">
          <SnowflakeIcon /> Neveras
        </TabsTrigger>
        <TabsTrigger value="residuos">
          <Trash2Icon /> Residuos
        </TabsTrigger>
        <TabsTrigger value="extintores">
          <FlameIcon /> Extintores
        </TabsTrigger>
        <TabsTrigger value="limpieza">
          <SparklesIcon /> Limpieza
        </TabsTrigger>
      </TabsList>

      <TabsContent value="temperatura" className="pt-4">
        <TemperaturaConsultorioTab sedes={sedes} consultorios={consultorios} puedeCrear={puedeCrear} />
      </TabsContent>

      <TabsContent value="neveras" className="pt-4">
        <TemperaturaNeveraTab sedes={sedes} neveras={neveras} puedeCrear={puedeCrear} />
      </TabsContent>

      <TabsContent value="residuos" className="pt-4">
        <ResiduosTab sedes={sedes} puedeCrear={puedeCrear} />
      </TabsContent>

      <TabsContent value="extintores" className="pt-4">
        <ExtintoresTab
          sedes={sedes}
          tiposExtintor={tiposExtintor}
          puedeCrear={puedeCrear}
          puedeEditar={puedeEditar}
        />
      </TabsContent>

      <TabsContent value="limpieza" className="pt-4">
        <LimpiezaTab
          sedes={sedes}
          consultorios={consultorios}
          puedeCrear={puedeCrear}
          nombreUsuario={nombreUsuario}
        />
      </TabsContent>
    </Tabs>
  );
}
