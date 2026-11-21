namespace Penancia.S.Domain.Model;

public sealed record Calibration(double UmPerPx, double Fps, double ChamberDepthUm)
{
    public bool IsValid =>
        double.IsFinite(UmPerPx) && UmPerPx > 0 &&
        double.IsFinite(Fps) && Fps > 0 &&
        double.IsFinite(ChamberDepthUm) && ChamberDepthUm > 0;
}
